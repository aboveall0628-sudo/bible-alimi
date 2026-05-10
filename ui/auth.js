/**
 * auth.js — Google 인증 및 마스터 비밀번호(Vault) 온보딩 흐름 제어
 */

import { setupNewVault } from '../crypto/keyManager.js';
import { db, doc, setDoc, getDoc, serverTimestamp } from '../data/firebase.js';

let _onSetupComplete = null;
let _currentUserId = null;

export function initAuth({ onSetupComplete }) {
    _onSetupComplete = onSetupComplete;
    renderSetupScreen();
    bindEvents();
}

export function showSetupScreen(userId) {
    _currentUserId = userId;
    const overlay = document.getElementById('setup-screen-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        // 1단계 화면으로 리셋
        document.getElementById('setup-step-1').classList.remove('hidden');
        document.getElementById('setup-step-2').classList.add('hidden');
    }
}

export function hideSetupScreen() {
    const overlay = document.getElementById('setup-screen-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}

export function showGoogleLoginScreen() {
    const overlay = document.getElementById('google-login-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }
}

export function hideGoogleLoginScreen() {
    const overlay = document.getElementById('google-login-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}

function renderSetupScreen() {
    if (document.getElementById('setup-screen-overlay')) return;

    // 1. 구글 로그인 오버레이
    const loginOverlay = document.createElement('div');
    loginOverlay.id = 'google-login-overlay';
    loginOverlay.className = 'lock-screen-overlay hidden';
    loginOverlay.innerHTML = `
        <div class="lock-screen-box">
            <div class="lock-icon">🕊️</div>
            <h2>Sanctum OS v2.0</h2>
            <p class="lock-subtitle">성장을 위한 영적 거울 시스템</p>
            <button id="auth-main-google-btn" class="primary-btn" style="width:100%; font-size:16px; padding:16px">
                Google 계정으로 시작하기
            </button>
        </div>
    `;
    document.body.appendChild(loginOverlay);

    // 2. 최초 설정 오버레이
    const setupOverlay = document.createElement('div');
    setupOverlay.id = 'setup-screen-overlay';
    setupOverlay.className = 'lock-screen-overlay hidden';
    setupOverlay.innerHTML = `
        <div class="lock-screen-box" style="max-width: 400px;">
            <!-- 단계 1: 비밀번호 설정 -->
            <div id="setup-step-1">
                <div class="lock-icon">🗝️</div>
                <h2>마스터 비밀번호 설정</h2>
                <p class="lock-subtitle">나만의 데이터 암호화를 위한 키입니다.<br><strong style="color:var(--dot-red)">분실 시 절대 복구할 수 없습니다.</strong></p>
                <input type="password" id="setup-pwd-1" class="lock-input" placeholder="비밀번호 입력" />
                <input type="password" id="setup-pwd-2" class="lock-input" placeholder="비밀번호 확인" />
                <div id="setup-error" class="lock-error hidden"></div>
                <button id="setup-next-btn" class="primary-btn" style="width:100%">생성하기</button>
            </div>

            <!-- 단계 2: 복구 코드 -->
            <div id="setup-step-2" class="hidden">
                <div class="lock-icon">📄</div>
                <h2>복구 코드 24단어</h2>
                <p class="lock-subtitle" style="text-align:left; font-size:13px;">비밀번호 분실 시 데이터를 살릴 수 있는 <strong>유일한 수단</strong>입니다. 안전한 곳에 적어두세요. 이 창을 닫으면 다시 볼 수 없습니다.</p>
                <div id="recovery-words-box" class="recovery-words-grid"></div>
                <label class="confirm-checkbox">
                    <input type="checkbox" id="setup-confirm-chk" />
                    <span>안전한 곳에 기록했습니다.</span>
                </label>
                <button id="setup-finish-btn" class="primary-btn" style="width:100%" disabled>시작하기</button>
            </div>
        </div>
    `;
    document.body.appendChild(setupOverlay);
}

function bindEvents() {
    // 구글 로그인 연동 (app.js의 handleAuthClick 이벤트를 디스패치)
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'auth-main-google-btn') {
            document.dispatchEvent(new CustomEvent('sanctum:request-google-login'));
        }
    });

    // 단계 1 -> 2
    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'setup-next-btn') {
            const p1 = document.getElementById('setup-pwd-1').value;
            const p2 = document.getElementById('setup-pwd-2').value;
            const err = document.getElementById('setup-error');

            if (p1.length < 4) {
                showErr(err, '비밀번호를 4자리 이상 입력해주세요.');
                return;
            }
            if (p1 !== p2) {
                showErr(err, '비밀번호가 일치하지 않습니다.');
                return;
            }

            e.target.textContent = '암호화 키 생성 중...';
            e.target.disabled = true;

            try {
                // 키마스터로 DEK 및 복구코드 생성
                const vaultData = await setupNewVault(p1);
                
                // Firestore에 키 메타데이터 저장 (dek와 recoveryWords 제외)
                await setDoc(doc(db, 'users', _currentUserId), {
                    masterKeySalt: vaultData.salt,
                    wrappedDEK_master: vaultData.wrappedDEK_master,
                    wrappedDEK_master_iv: vaultData.wrappedDEK_master_iv,
                    wrappedDEK_recovery: vaultData.wrappedDEK_recovery,
                    wrappedDEK_recovery_iv: vaultData.wrappedDEK_recovery_iv,
                    kdfParams: vaultData.kdfParams,
                    createdAt: serverTimestamp()
                });

                // 복구 단어 표시
                document.getElementById('setup-step-1').classList.add('hidden');
                document.getElementById('setup-step-2').classList.remove('hidden');
                
                const wordsBox = document.getElementById('recovery-words-box');
                wordsBox.innerHTML = vaultData.recoveryWords.map((w, i) => 
                    `<div class="word-chip"><span class="w-num">${i+1}.</span> ${w}</div>`
                ).join('');

                // 완료 시 전달할 dek 임시 저장
                document.getElementById('setup-finish-btn').onclick = () => {
                    hideSetupScreen();
                    if (_onSetupComplete) _onSetupComplete(vaultData.dek);
                };

            } catch (error) {
                console.error(error);
                showErr(err, '생성 중 오류가 발생했습니다.');
                e.target.textContent = '생성하기';
                e.target.disabled = false;
            }
        }
    });

    // 체크박스 제어
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'setup-confirm-chk') {
            document.getElementById('setup-finish-btn').disabled = !e.target.checked;
        }
    });
}

function showErr(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}
