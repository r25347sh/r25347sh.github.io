document.addEventListener('DOMContentLoaded', () => {
    const errorCode = document.getElementById('errorCode');
    const container = document.getElementById('errorContainer');

    // ランダムな時間（ミリ秒）を返す関数
    const getRandomTime = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // グリッチ（バグ）エフェクトを発動させる関数
    function triggerGlitch() {
        // CSSのバグ用クラスを追加
        errorCode.classList.add('glitch-active');
        
        // 画面全体をわずかに傾ける
        container.style.transform = `skew(${getRandomTime(-5, 5)}deg)`;

        // 0.15秒後にバグ状態を解除して元に戻す
        setTimeout(() => {
            errorCode.classList.remove('glitch-active');
            container.style.transform = 'skew(0deg)';
            
            // 解除されたら、また次のランダムなタイミングで発動するようにループさせる
            scheduleNextGlitch();
        }, 150);
    }

    // 次のグリッチのタイミングを計画（2秒〜6秒のランダムな間隔）
    function scheduleNextGlitch() {
        const nextInterval = getRandomTime(2000, 6000);
        setTimeout(triggerGlitch, nextInterval);
    }

    // 最初のグリッチを発動
    scheduleNextGlitch();
});
