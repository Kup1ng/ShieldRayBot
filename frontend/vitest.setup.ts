/**
 * Test environment fixes for happy-dom.
 *
 * The Web Animations spec marks an animation's rejected `finished` promise as handled when the
 * animation is cancelled; happy-dom does not, so every animation cancelled by an unmounting
 * component (HeroUI/motion transitions) surfaced as an unhandled rejection.
 */
const AnimationClass = (globalThis as { Animation?: { prototype: Animation } }).Animation;

if (AnimationClass) {
  const cancel = AnimationClass.prototype.cancel;
  AnimationClass.prototype.cancel = function cancelHandled(this: Animation) {
    this.finished?.catch(() => undefined);
    return cancel.call(this);
  };
}
