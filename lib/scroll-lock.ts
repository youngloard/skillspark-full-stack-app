// Lock body scroll without the layout shifting. Hiding the scrollbar reclaims
// its width, which nudges the whole page sideways — so we pad the body by the
// scrollbar width while locked and restore it on unlock. Returns the unlock fn.

export function lockBodyScroll(): () => void {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const prevOverflow = document.body.style.overflow;
  const prevPadding = document.body.style.paddingRight;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  return () => {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPadding;
  };
}
