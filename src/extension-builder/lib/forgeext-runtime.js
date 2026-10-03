/**
 * ForgeExt runtime — injected into every exported extension so that the
 * generated block implementations (ForgeExt.Motion.moveSteps etc.) actually
 * work inside TurboWarp. Without this, blocks would throw
 * "ForgeExt is not defined" and appear to do nothing.
 *
 * Uses util.target (RenderedTarget) properties directly, so blocks have a
 * real visible effect in the TurboWarp project.
 */

export const FORGEXT_RUNTIME = `
// ============================================================
// ForgeExt runtime (injected by Extension Editor)
// ============================================================
const ForgeExt = (() => {
    let currentUtil = null;
    const target = () => (currentUtil && currentUtil.target) || null;

    // Tiny Web Audio helper for music blocks
    let audioCtx = null;
    const getCtx = () => {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
        }
        return audioCtx;
    };
    const playFreq = (freq, secs) => {
        const ctx = getCtx();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = Math.max(1, freq);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + secs);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + secs);
        } catch (e) { /* audio may be blocked */ }
    };

    return {
        _setUtil: (u) => { currentUtil = u; },

        Motion: {
            moveSteps: (steps) => {
                const t = target();
                if (!t) return;
                const rad = ((t.direction - 90) * Math.PI) / 180;
                t.x += steps * Math.cos(rad);
                t.y += steps * Math.sin(rad);
            },
            turnRight: (deg) => {
                const t = target();
                if (!t) return;
                t.direction = (t.direction + (deg || 0)) % 360;
            },
            turnLeft: (deg) => {
                const t = target();
                if (!t) return;
                t.direction = (((t.direction - (deg || 0)) % 360) + 360) % 360;
            },
            pointInDirection: (deg) => {
                const t = target();
                if (!t) return;
                t.direction = (deg || 0) % 360;
            },
            glideTo: (secs, x, y) => {
                const t = target();
                if (!t) return;
                t.x = x;
                t.y = y;
            },
            xPosition: () => { const t = target(); return t ? t.x : 0; },
            yPosition: () => { const t = target(); return t ? t.y : 0; },
            direction: () => { const t = target(); return t ? t.direction : 90; }
        },

        Looks: {
            say: (msg, secs) => {
                const t = target();
                if (!t) return;
                // Try to use the runtime say bubble if available, else console.
                const rt = currentUtil && currentUtil.runtime;
                if (rt && typeof rt.requestSayBubble === 'function') {
                    try { rt.requestSayBubble(t, msg, secs || 2); } catch (e) { /* fallback */ }
                } else if (typeof t.setSayBubble === 'function') {
                    try { t.setSayBubble(msg, secs || 2); } catch (e) { /* fallback */ }
                } else {
                    console.log('[ForgeExt]', msg);
                }
            },
            think: (msg, secs) => ForgeExt.Looks.say('(思考) ' + msg, secs),
            show: () => { const t = target(); if (t) t.visible = true; },
            hide: () => { const t = target(); if (t) t.visible = false; },
            changeSize: (delta) => {
                const t = target();
                if (!t) return;
                t.size = Math.max(1, (t.size || 100) + (delta || 0));
            },
            size: () => { const t = target(); return t ? (t.size || 100) : 100; }
        },

        Music: {
            playNote: (note, beats) => {
                const freq = 440 * Math.pow(2, ((note || 60) - 69) / 12);
                playFreq(freq, (beats || 1) * 0.4);
            },
            playTone: (freq, secs) => playFreq(freq || 440, secs || 0.5),
            rest: () => { /* silence */ },
            setTempo: () => { /* stored by caller if needed */ },
            setVolume: () => { /* audio gain could be wired here */ }
        }
    };
})();
`;

/**
 * Prepends ForgeExt._setUtil(util) to a generated method body so every
 * block implementation has a valid util context.
 */
export function withUtilInjection(code) {
    if (!code) return code;
    // Inject after the first "{ " of each method signature, i.e. after
    // `opcode(args, util) {` or `async opcode(args, util) {`.
    // Also expose `runtime` (util.runtime → scratch-vm Runtime) so blocks that
    // reference runtime.broadcast / runtime.ioDevices / runtime.startHats etc.
    // don't throw ReferenceError. util.runtime is a getter on BlockUtility
    // that returns the vm Runtime (EventEmitter with ioDevices/startHats/...).
    return code.replace(/(async\s+)?(\(args,\s*util\)\s*\{)/g, '$1$2\n            ForgeExt._setUtil(util);\n            const runtime = (util && util.runtime) || (util && util.target && util.target.runtime) || null;');
}
