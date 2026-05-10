/**
 * settings.js — 설정 및 보안 뷰 제어
 * - v1 데이터 진단/마이그레이션
 * - 비밀번호 변경
 * - 전체 데이터 백업
 */

import { diagnoseV1Data } from '../scripts/diagnose-v1-data.js';
import { migrateCollection, downloadJsonSnapshot } from '../scripts/migrate-v1-to-v2.js';
import { exportAllData } from '../security/exportBackup.js';
import { getDEK } from './lockScreen.js';
import { changePassword, unlockVault } from '../crypto/keyManager.js';
import { db, doc, setDoc, getDoc, serverTimestamp } from '../data/firebase.js';
import { logAuditAction } from '../security/auditLog.js';

let _userId = null;
let _userEmail = null;
let _diagnosticData = null;

export function renderSettingsView(userId, userEmail) {
    _userId = userId;
    _userEmail = userEmail || null;
    injectExtraSections();
    bindEvents();
    // v1 식별자 입력란에 이메일 기본값 채우기
    const v1Input = document.getElementById('v1-id-input');
    if (v1Input && _userEmail && !v1Input.value) v1Input.value = _userEmail;
}

/**
 * index.html에 정의되지 않은 추가 카드(비밀번호 변경, v1 식별자 입력)를 동적 주입
 * 한 번만 주입.
 */
function injectExtraSections() {
    const container = document.getElementById('settings-container');
    if (!container || document.getElementById('settings-extra-injected')) return;

    // 진단 카드 안에 v1 식별자 입력 추가
    const diagBox = document.getElementById('migration-status-box');
    if (diagBox && !document.getElementById('v1-id-input')) {
        const idRow = document.createElement('div');
        idRow.style.cssText = 'margin: 12px 0; display: flex; gap: 8px; align-items: center;';
        idRow.innerHTML = `
            <label style="font-size:12px;color:var(--text-secondary);min-width:120px;">v1에서 사용한 식별자</label>
            <input id="v1-id-input" type="text" placeholder="이메일 또는 UID"
                   style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);font-size:13px;" />
        `;
        diagBox.parentNode.insertBefore(idRow, diagBox.nextSibling);
    }

    // 비밀번호 변경 카드
    const pwCard = document.createElement('div');
    pwCard.id = 'settings-extra-injected';
    pwCard.className = 'card-section';
    pwCard.innerHTML = `
        <h3 class="section-title">비밀번호 변경</h3>
        <p class="section-desc">DEK는 그대로 유지되며 마스터 키만 다시 wrap합니다(데이터 재암호화 불필요).</p>
        <div style="display:flex;flex-direction:column;gap:8px;max-width:360px;">
            <input id="pw-old" type="password" placeholder="현재 비밀번호" autocomplete="current-password"
                   style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);" />
            <input id="pw-new" type="password" placeholder="새 비밀번호 (4자 이상)" autocomplete="new-password"
                   style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);" />
            <input id="pw-new2" type="password" placeholder="새 비밀번호 확인" autocomplete="new-password"
                   style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);" />
            <div id="pw-error" style="color:var(--dot-red);font-size:12px;min-height:16px;"></div>
            <button id="btn-change-pw" class="primary-btn" style="align-self:flex-start;">비밀번호 변경</button>
        </div>
    `;
    container.appendChild(pwCard);
}

function bindEvents() {
    const btnDiagnose = document.getElementById('btn-diagnose');
    const btnMigrate = document.getElementById('btn-migrate');
    const btnBackup = document.getElementById('btn-backup');
    const btnExport = document.getElementById('btn-export-backup');
    const statusBox = document.getElementById('migration-status-box');

    if (btnDiagnose) btnDiagnose.onclick = async () => {
        const v1Id = (document.getElementById('v1-id-input')?.value || '').trim();
        const accepted = [];
        if (_userId) accepted.push(_userId);
        if (_userEmail) accepted.push(_userEmail);
        if (v1Id) accepted.push(v1Id);
        if (accepted.length === 0) {
            statusBox.innerHTML = '<p style="color:var(--dot-red)">v1 식별자를 입력해주세요.</p>';
            return;
        }

        btnDiagnose.disabled = true;
        btnDiagnose.textContent = '진단 중...';
        statusBox.innerHTML = `<p>스캔 중... (식별자: ${accepted.join(', ')})</p>`;

        try {
            _diagnosticData = await diagnoseV1Data(accepted);
            let html = '<ul style="margin-left:18px;">';
            let totalCount = 0;
            for (const [col, info] of Object.entries(_diagnosticData)) {
                html += `<li><strong>${col}</strong>: ${info.count}개 (최근 ${info.latest})</li>`;
                totalCount += info.count;
            }
            html += '</ul>';

            if (totalCount === 0) {
                html = '<p>이전할 v1 데이터가 없어요. 모두 정상입니다.</p>';
                if (btnMigrate) btnMigrate.disabled = true;
                if (btnBackup) btnBackup.disabled = true;
            } else {
                html += `<p style="margin-top:8px;font-weight:bold;color:var(--dot-orange)">총 ${totalCount}개 평문 데이터를 발견했어요. 마이그레이션하세요.</p>`;
                if (btnMigrate) btnMigrate.disabled = false;
                if (btnBackup) btnBackup.disabled = false;
            }
            statusBox.innerHTML = html;
        } catch (e) {
            console.error(e);
            statusBox.innerHTML = '<p style="color:var(--dot-red)">진단 중 오류가 발생했어요. 콘솔을 확인하세요.</p>';
        }
        btnDiagnose.disabled = false;
        btnDiagnose.textContent = '진단 시작';
    };

    if (btnMigrate) btnMigrate.onclick = async () => {
        const dek = getDEK();
        if (!dek) return alert('잠금 해제가 필요합니다.');
        if (!_diagnosticData) return alert('먼저 진단을 실행하세요.');
        if (!confirm('발견된 데이터를 암호화된 v2 스토리지로 옮기시겠어요?\n원본은 _legacy_*에 보존됩니다.')) return;

        btnMigrate.disabled = true;
        let total = 0;

        for (const [col, info] of Object.entries(_diagnosticData)) {
            statusBox.innerHTML = `<p>[${col}] 이전 중... (${info.count}건)</p>`;
            try {
                const ok = await migrateCollection(dek, _userId, col, info.docs, (curr, tot) => {
                    btnMigrate.textContent = `${curr}/${tot}`;
                });
                total += ok;
            } catch (e) {
                console.error(`[${col}] 이전 실패`, e);
            }
        }

        statusBox.innerHTML = `<p style="color:var(--dot-green);font-weight:bold;">✅ 총 ${total}개 데이터를 안전하게 옮겼어요.</p>`;
        btnMigrate.textContent = '마이그레이션 실행';
        await logAuditAction(_userId, 'migrate_complete', { count: total });
    };

    if (btnBackup) btnBackup.onclick = () => {
        if (!_diagnosticData) return;
        downloadJsonSnapshot(_diagnosticData);
    };

    if (btnExport) btnExport.onclick = async () => {
        const dek = getDEK();
        if (!dek) return alert('잠금 해제가 필요합니다.');
        btnExport.disabled = true;
        btnExport.textContent = '다운로드 준비 중...';
        try {
            await exportAllData(dek, _userId);
        } catch (e) {
            console.error(e);
            alert('백업 중 오류가 발생했어요.');
        }
        btnExport.textContent = '전체 데이터 암호화 백업 (JSON)';
        btnExport.disabled = false;
    };

    const btnPw = document.getElementById('btn-change-pw');
    if (btnPw) btnPw.onclick = async () => {
        const oldPw = document.getElementById('pw-old').value;
        const newPw = document.getElementById('pw-new').value;
        const newPw2 = document.getElementById('pw-new2').value;
        const err = document.getElementById('pw-error');
        err.textContent = '';

        if (newPw.length < 4) { err.textContent = '새 비밀번호를 4자 이상으로.'; return; }
        if (newPw !== newPw2) { err.textContent = '새 비밀번호가 일치하지 않아요.'; return; }

        const dek = getDEK();
        if (!dek) { err.textContent = '잠금 해제가 필요합니다.'; return; }

        btnPw.disabled = true;
        btnPw.textContent = '확인 중...';

        try {
            // 1) 현재 비밀번호 검증: vault doc의 wrappedDEK_master를 unwrap 시도
            const userSnap = await getDoc(doc(db, 'users', _userId));
            if (!userSnap.exists()) throw new Error('NO_VAULT');
            const v = userSnap.data();
            await unlockVault(oldPw, v.masterKeySalt, v.wrappedDEK_master, v.wrappedDEK_master_iv, v.kdfParams || null);

            // 2) 새 비밀번호로 DEK 다시 wrap
            const re = await changePassword(dek, newPw);

            // 3) 저장
            await setDoc(doc(db, 'users', _userId), {
                masterKeySalt: re.salt,
                wrappedDEK_master: re.wrappedDEK_master,
                wrappedDEK_master_iv: re.wrappedDEK_master_iv,
                kdfParams: re.kdfParams,
                pwChangedAt: serverTimestamp(),
            }, { merge: true });

            await logAuditAction(_userId, 'change_password');

            err.style.color = 'var(--dot-green)';
            err.textContent = '✅ 변경되었어요.';
            document.getElementById('pw-old').value = '';
            document.getElementById('pw-new').value = '';
            document.getElementById('pw-new2').value = '';
            setTimeout(() => { err.textContent = ''; err.style.color = 'var(--dot-red)'; }, 3000);
        } catch (e) {
            console.error(e);
            if (e.message === 'WRONG_PASSWORD') err.textContent = '현재 비밀번호가 맞지 않아요.';
            else if (e.message === 'NO_VAULT') err.textContent = '계정 정보를 찾을 수 없어요.';
            else err.textContent = '변경 중 오류가 발생했어요.';
        } finally {
            btnPw.disabled = false;
            btnPw.textContent = '비밀번호 변경';
        }
    };
}
