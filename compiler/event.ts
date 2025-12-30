
// compiler/event.ts
// Phase 2: fully dynamic, compiler-driven DOM event system.
// Uses a single generic delegate function for all event types and adds DOM helper methods.

export function generateEventBindingRuntime(eventTypes: string[]): string {
  // Phase 2: Generate DOM helper methods and a single generic delegate function
  // The delegate function dynamically handles any event type by checking data-zen-* attributes
  
  const eventTypesStr = JSON.stringify(eventTypes);
  
  return `
// Phase 2 runtime helpers - DOM manipulation methods on HTMLElement prototype
HTMLElement.prototype.show = function() { this.style.display = "block"; }
HTMLElement.prototype.hide = function() { this.style.display = "none"; }
HTMLElement.prototype.addClass = function(name) { this.classList.add(name); }
HTMLElement.prototype.removeClass = function(name) { this.classList.remove(name); }
HTMLElement.prototype.setText = function(text) { this.textContent = text; }
HTMLElement.prototype.setHTML = function(html) { this.innerHTML = html; }

// Phase 2: Dynamic delegated event listener - single generic function for all event types
function delegate(event) {
  let type = event.type;
  let el = event.target;
  while (el && !el.hasAttribute(\`data-zen-\${type}\`)) el = el.parentElement;
  const handlerName = el?.getAttribute(\`data-zen-\${type}\`);
  if (handlerName && typeof window[handlerName] === "function") {
    window[handlerName](event, el);
  }
}

// Attach delegate function to all detected event types dynamically
const zenEvents = ${eventTypesStr};
zenEvents.forEach(type => {
  document.addEventListener(type, delegate);
});
`;
}
