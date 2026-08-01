// Ported from celebrate(x, y) in app/index.html — a small DOM-based confetti
// burst fired when a task is checked off. Pure imperative DOM effect, no
// React dependency, callable from anywhere (e.g. a checkbox's onChange).
//
// Relies on the `.celebrate-particle` class + `@keyframes particleFly`
// defined in website/app/globals.css (ported alongside this function, since
// the vanilla CSS these particles depend on lives in app/index.html's
// <style> block, not anywhere shared with the website).
export function celebrate(x: number, y: number): void {
  const colors = ['#F07814', '#29B8D8', '#6FB43C', '#4FC3F0', '#F5B678'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'celebrate-particle';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.background = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
    const dist = 26 + Math.random() * 26;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', (Math.sin(angle) * dist - 14) + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}
