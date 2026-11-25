export const title = "Arpeggiated Canvas: A 15-Second Digital Fugue";

export function start({ audioContext, canvas, duration, random }) {
    const ctx = canvas.getContext('2d');
    const startAudioTime = audioContext.currentTime;
    
    // Frequency constants (equal temperament)
    const C3 = 130.81, E4 = 329.63, G4 = 392.00;
    const F3 = 174.61, A4 = 440.00, C5 = 523.25;
    const G3 = 196.00, B4 = 493.88, D5 = 587.33;
    
    // Chord sequences (6 notes per 3-second chord)
    const chord1 = [C3, E4, G4, E4, C3, E4]; // C major arpeggio
    const chord2 = [F3, A4, C5, A4, F3, A4]; // F major
    const chord3 = [G3, B4, D5, B4, G3, B4]; // G major
    const allChords = [chord1, chord2, chord3, chord1, chord3]; // 5 chords for 15s
    
    // Bass drone for each chord
    const bassNotes = [
        { start: 0, end: 3, freq: C3 },
        { start: 3, end: 6, freq: F3 },
        { start: 6, end: 9, freq: G3 },
        { start: 9, end: 12, freq: C3 },
        { start: 12, end: 15, freq: G3 }
    ];
    
    // Create melody notes with visual coordinates
    const minFreq = C3, maxFreq = D5;
    const freqRange = maxFreq - minFreq;
    const notes = [];
    
    allChords.forEach((chord, chordIndex) => {
        chord.forEach((freq, noteIndex) => {
            const start = chordIndex * 3 + noteIndex * 0.5;
            const x = (start / duration) * canvas.width;
            const y = canvas.height * (1 - (freq - minFreq) / freqRange);
            notes.push({ start, freq, x, y, chordIndex, duration: 0.5 });
        });
    });
    
    // Schedule audio: arpeggio + bass drone
    const attack = 0.03, release = 0.07;
    const scheduleNote = (start, freq, dur, isBass = false) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.frequency.value = freq;
        osc.type = isBass ? 'sine' : 'sine';
        
        const noteStart = startAudioTime + start;
        const noteEnd = noteStart + dur;
        
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(isBass ? 0.25 : 0.4, noteStart + attack);
        gain.gain.linearRampToValueAtTime(isBass ? 0.25 : 0.4, noteEnd - release);
        gain.gain.linearRampToValueAtTime(0, noteEnd);
        
        osc.start(noteStart);
        osc.stop(noteEnd);
    };
    
    // Schedule arpeggio
    notes.forEach(n => scheduleNote(n.start, n.freq, n.duration));
    
    // Schedule bass drone
    bassNotes.forEach(n => scheduleNote(n.start, n.freq, n.end - n.start, true));
    
    // Visual styling
    const colors = ['#00aaff', '#00ffaa', '#ff00aa', '#00aaff', '#ff00aa'];
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#020024');
    bgGradient.addColorStop(1, '#090979');
    
    // Animation loop
    const animate = () => {
        const elapsed = audioContext.currentTime - startAudioTime;
        if (elapsed >= duration) return;
        
        // Clear with animated background
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw starfield (static but creates depth)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let i = 0; i < 200; i++) {
            const x = random() * canvas.width;
            const y = random() * canvas.height;
            const size = random() * 1.5;
            ctx.fillRect(x, y, size, size);
        }
        
        // Current note index (0.5s per note)
        const currentNoteIndex = Math.min(notes.length - 1, Math.floor(elapsed * 2));
        
        // Draw melody path with chord-based colors
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let i = 1; i <= currentNoteIndex; i++) {
            const prev = notes[i-1];
            const curr = notes[i];
            ctx.strokeStyle = colors[curr.chordIndex];
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
        }
        
        // Draw current note as glowing orb
        if (currentNoteIndex >= 0) {
            const curr = notes[currentNoteIndex];
            const radius = 12 + Math.sin(elapsed * 8) * 3;
            const gradient = ctx.createRadialGradient(
                curr.x, curr.y, 0,
                curr.x, curr.y, radius * 2
            );
            gradient.addColorStop(0, colors[curr.chordIndex]);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(curr.x, curr.y, radius * 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = colors[curr.chordIndex];
            ctx.beginPath();
            ctx.arc(curr.x, curr.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
}
