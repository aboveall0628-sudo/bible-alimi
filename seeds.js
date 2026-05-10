import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

export async function initializeSeedData(db, userId) {
    if (!db || !userId) return;

    // 1. Mandatory Pinned Principle
    const principleId = "initial_mandatory_principle";
    const principleRef = doc(db, "principles", principleId);
    const principleSnap = await getDoc(principleRef);

    if (!principleSnap.exists()) {
        await setDoc(principleRef, {
            userId: userId,
            title: "말씀으로 방향 점검",
            body: "선택 전 하나님께 묻고 응답 기다리기. 모든 의사결정의 최우선 방향타로 삼는다.",
            category: "spiritual",
            derivedFromDotIds: [],
            triggerKeywords: ["의사결정", "선택", "기도", "방향"],
            active: true,
            pinned: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        console.log("Seed: Mandatory principle initialized.");
    }

    // 2. Default Labels (Stored in user settings or a meta collection)
    // For now, we'll keep them as a constant in script.js, 
    // but we could store them in a 'settings' collection.
    const settingsRef = doc(db, "settings", userId);
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
            labels: {
                spiritual: ["평안함", "감사함", "메마름", "갈급함"],
                energy: ["활기참", "적당함", "피로함", "방전됨"],
                environment: ["집중잘됨", "소란스러움", "편안함", "불편함"],
                cognitive: ["명료함", "평이함", "복잡함", "멍함"],
                relationship: ["따뜻함", "무난함", "갈등있음", "어색함"]
            },
            updatedAt: serverTimestamp()
        });
        console.log("Seed: Default labels initialized.");
    }
}
