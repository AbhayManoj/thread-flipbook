const magazinePages = Array.from(
  { length: 28 },
  (_, index) => `pages/${index + 1}.png`
);

const bookShell = document.getElementById("bookShell");
const pageCounter = document.getElementById("pageCounter");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const zoomBtn = document.getElementById("zoomBtn");
const soundBtn = document.getElementById("soundBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const pageFlipAudio = new Audio("assets/page-flip.mp3");
pageFlipAudio.preload = "auto";
pageFlipAudio.volume = 0.45;

let soundEnabled = true;
let suppressFlipSound = false;
let audioUnlocked = false;

/*
  Base portrait page size.
  Desktop: two-page spread.
  Mobile: one-page flip.
*/
const BASE_PAGE_WIDTH = 390;
const BASE_PAGE_HEIGHT = 550;

let pageFlip = null;
let bookElement = null;

let currentPageWidth = BASE_PAGE_WIDTH;
let currentPageHeight = BASE_PAGE_HEIGHT;

let resizeTimer = null;

/*
  Smooth visual zoom.
  Desktop fullscreen:
  - trackpad pinch zoom
  - drag/pan when zoomed

  Mobile:
  - two-finger pinch zoom
  - one-finger drag/pan when zoomed
*/
let visualZoom = 1;
let zoomPanX = 0;
let zoomPanY = 0;

/*
  Drag-to-pan state.
*/
let isPanningZoomedBook = false;
let lastPanClientX = 0;
let lastPanClientY = 0;

/*
  Mobile pinch zoom state.
*/
let isMobilePinching = false;
let initialPinchDistance = 0;
let initialPinchZoom = 1;

function isMobileView() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function recreateBookContainer() {
  bookShell.innerHTML = "";

  bookElement = document.createElement("div");
  bookElement.id = "book";

  bookShell.appendChild(bookElement);
}

function createPageElements() {
  magazinePages.forEach((pageSrc, index) => {
    const page = document.createElement("div");
    page.className = "page";

    const img = document.createElement("img");
    img.src = pageSrc;
    img.alt = `Page ${index + 1}`;

    page.appendChild(img);
    bookElement.appendChild(page);
  });
}

function getLayoutScale() {
  const isFullscreen = !!document.fullscreenElement;
  const isMobile = isMobileView();

  let scale = 1;

  if (isMobile) {
    /*
      Mobile:
      One page only. Keep it inside the area above the icons.
    */
    const availableWidth = window.innerWidth - 42;
    const availableHeight = window.innerHeight - 150;

    scale = Math.min(
      availableWidth / BASE_PAGE_WIDTH,
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 1.05);
    scale = Math.max(scale, 0.55);
  } else if (isFullscreen) {
    /*
      Desktop fullscreen:
      Large two-page spread, ratio preserved.
      Smooth pinch zoom is handled visually after this base size.
    */
    const availableWidth = window.innerWidth - 90;
    const availableHeight = window.innerHeight - 135;

    scale = Math.min(
      availableWidth / (BASE_PAGE_WIDTH * 2),
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 2.2);
    scale = Math.max(scale, 1);
  } else {
    /*
      Desktop normal/resized:
      Book shrinks when browser height becomes smaller,
      so bottom icons remain below the book.
    */
    const availableWidth = window.innerWidth - 110;
    const availableHeight = window.innerHeight - 145;

    scale = Math.min(
      availableWidth / (BASE_PAGE_WIDTH * 2),
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 1);
    scale = Math.max(scale, 0.55);
  }

  return scale;
}

function unlockAudio() {
  if (audioUnlocked) return;

  const originalVolume = pageFlipAudio.volume;

  pageFlipAudio.volume = 0;

  pageFlipAudio
    .play()
    .then(() => {
      pageFlipAudio.pause();
      pageFlipAudio.currentTime = 0;
      pageFlipAudio.volume = originalVolume;
      audioUnlocked = true;
    })
    .catch(() => {
      pageFlipAudio.volume = originalVolume;
    });
}

function playPageFlipSound() {
  if (!soundEnabled || suppressFlipSound) return;

  pageFlipAudio.pause();
  pageFlipAudio.currentTime = 0;
  pageFlipAudio.volume = 0.45;

  pageFlipAudio.play().catch(() => {
    // Browser may block sound until user interacts with the page.
  });
}

function updateSoundButton() {
  soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  soundBtn.title = soundEnabled ? "Sound on" : "Sound off";
}

document.addEventListener("pointerdown", unlockAudio, { once: true });

function buildFlipbook(targetPageIndex = 0) {
  const isMobile = isMobileView();

  const safePageIndex = Math.max(
    0,
    Math.min(targetPageIndex, magazinePages.length - 1)
  );

  if (pageFlip && typeof pageFlip.destroy === "function") {
    try {
      pageFlip.destroy();
    } catch (error) {
      console.warn("PageFlip destroy skipped:", error);
    }
  }

  pageFlip = null;

  recreateBookContainer();
  createPageElements();

  const scale = getLayoutScale();

  currentPageWidth = Math.round(BASE_PAGE_WIDTH * scale);
  currentPageHeight = Math.round(BASE_PAGE_HEIGHT * scale);

  pageFlip = new St.PageFlip(bookElement, {
    width: currentPageWidth,
    height: currentPageHeight,

    /*
      Fixed size keeps cursor/fold math accurate.
      Do not use CSS transform scale for the base book size.
    */
    size: "fixed",

    /*
      Desktop:
      showCover true + usePortrait false = two-page spread.

      Mobile:
      showCover false + usePortrait true = one-page flip.
    */
    showCover: !isMobile,
    usePortrait: isMobile,

    /*
      Keep native PageFlip interaction enabled.
      This preserves the real curl/roll animation.
    */
    useMouseEvents: true,

    mobileScrollSupport: false,
    drawShadow: true,
    flippingTime: isMobile ? 650 : 700,
    autoSize: true,
    maxShadowOpacity: isMobile ? 0.35 : 0.5
  });

  pageFlip.loadFromHTML(document.querySelectorAll("#book .page"));

  pageFlip.on("flip", () => {
    updatePageCounter();
    syncBookLayout();
    playPageFlipSound();
  });

  setTimeout(() => {
    suppressFlipSound = true;

    if (safePageIndex > 0 && typeof pageFlip.turnToPage === "function") {
      pageFlip.turnToPage(safePageIndex);
    }

    updatePageCounter();
    syncBookLayout();
    applyVisualZoom();

    setTimeout(() => {
      suppressFlipSound = false;
    }, 350);
  }, 150);
}

function updatePageCounter() {
  if (!pageFlip) return;

  const isMobile = isMobileView();
  const currentPage = pageFlip.getCurrentPageIndex() + 1;
  const totalPages = magazinePages.length;

  if (isMobile || currentPage === 1) {
    pageCounter.textContent = `page ${currentPage} of ${totalPages}`;
    return;
  }

  const leftPage = currentPage;
  const rightPage = Math.min(currentPage + 1, totalPages);

  if (leftPage === rightPage) {
    pageCounter.textContent = `page ${leftPage} of ${totalPages}`;
  } else {
    pageCounter.textContent = `pages ${leftPage} - ${rightPage} of ${totalPages}`;
  }
}

function syncBookLayout() {
  if (!pageFlip) return;

  const isMobile = isMobileView();
  const currentPageIndex = pageFlip.getCurrentPageIndex();
  const isFullscreen = !!document.fullscreenElement;

  const isDesktopSpread = !isMobile && currentPageIndex > 0;

  const bookShiftX = isMobile
    ? 0
    : isDesktopSpread
      ? 0
      : -(currentPageWidth / 2);

  bookShell.style.setProperty("--book-shift-x", `${bookShiftX}px`);

  /*
    Mobile arrows stay near the screen edges.
  */
  if (isMobile) {
    document.documentElement.style.setProperty("--left-arrow-x", "24px");
    document.documentElement.style.setProperty(
      "--right-arrow-x",
      `${window.innerWidth - 24}px`
    );
    return;
  }

  /*
    Desktop arrows sit outside the visible book.
    When visually zoomed, arrows also move outside the zoomed book.
  */
  const viewerCenterX = window.innerWidth / 2 + zoomPanX;

  const visibleBookWidth = isDesktopSpread
    ? currentPageWidth * 2
    : currentPageWidth;

  const halfVisibleBookWidth = (visibleBookWidth * visualZoom) / 2;
  const arrowGap = isFullscreen ? 70 : 60;

  const leftArrowX = viewerCenterX - halfVisibleBookWidth - arrowGap;
  const rightArrowX = viewerCenterX + halfVisibleBookWidth + arrowGap;

  document.documentElement.style.setProperty("--left-arrow-x", `${leftArrowX}px`);
  document.documentElement.style.setProperty("--right-arrow-x", `${rightArrowX}px`);
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getVisibleBookWidth() {
  if (!pageFlip) return currentPageWidth;

  const isMobile = isMobileView();
  const currentPageIndex = pageFlip.getCurrentPageIndex();
  const isDesktopSpread = !isMobile && currentPageIndex > 0;

  return isDesktopSpread ? currentPageWidth * 2 : currentPageWidth;
}

function clampZoomPan() {
  if (visualZoom <= 1) {
    zoomPanX = 0;
    zoomPanY = 0;
    return;
  }

  const visibleBookWidth = getVisibleBookWidth() * visualZoom;
  const visibleBookHeight = currentPageHeight * visualZoom;

  /*
    Keep panning within a controlled range.
    A small extra allowance makes the zoom feel less restrictive.
  */
  const maxPanX = Math.max(0, (visibleBookWidth - window.innerWidth) / 2 + 160);
  const maxPanY = Math.max(0, (visibleBookHeight - window.innerHeight) / 2 + 160);

  zoomPanX = clampValue(zoomPanX, -maxPanX, maxPanX);
  zoomPanY = clampValue(zoomPanY, -maxPanY, maxPanY);
}

function applyVisualZoom() {
  if (!bookElement) return;

  clampZoomPan();

  bookElement.style.setProperty("--visual-zoom", visualZoom);
  bookElement.style.setProperty("--visual-pan-x", `${zoomPanX}px`);
  bookElement.style.setProperty("--visual-pan-y", `${zoomPanY}px`);

  /*
    Desktop fullscreen OR mobile zoomed mode should show grab behavior.
  */
  if (visualZoom > 1.01 && (document.fullscreenElement || isMobileView())) {
    bookElement.classList.add("zoom-pan");
  } else {
    bookElement.classList.remove("zoom-pan");
    bookElement.classList.remove("is-panning");
  }

  syncBookLayout();
}

function resetVisualZoom() {
  visualZoom = 1;
  zoomPanX = 0;
  zoomPanY = 0;
  stopZoomPan();
  applyVisualZoom();
}

function zoomToPoint(clientX, clientY, newZoom) {
  if (!bookElement) return;

  const oldZoom = visualZoom;
  const clampedZoom = clampValue(newZoom, 1, 2.4);

  if (clampedZoom === oldZoom) return;

  const rect = bookElement.getBoundingClientRect();

  const currentCenterX = rect.left + rect.width / 2;
  const currentCenterY = rect.top + rect.height / 2;

  const zoomRatio = clampedZoom / oldZoom;

  zoomPanX = zoomPanX + (clientX - currentCenterX) * (1 - zoomRatio);
  zoomPanY = zoomPanY + (clientY - currentCenterY) * (1 - zoomRatio);

  visualZoom = clampedZoom;

  applyVisualZoom();
}

function zoomAtPoint(clientX, clientY, zoomFactor) {
  zoomToPoint(clientX, clientY, visualZoom * zoomFactor);
}

function isZoomPanActive() {
  return (
    bookElement &&
    visualZoom > 1.01 &&
    (document.fullscreenElement || isMobileView())
  );
}

function stopZoomPan() {
  if (!isPanningZoomedBook) return;

  isPanningZoomedBook = false;

  if (bookElement) {
    bookElement.classList.remove("is-panning");
  }
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;

  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function stopMobilePinch() {
  isMobilePinching = false;
  initialPinchDistance = 0;
  initialPinchZoom = visualZoom;

  if (visualZoom <= 1.01) {
    resetVisualZoom();
  }
}

/* Previous page */
prevBtn.addEventListener("click", () => {
  if (pageFlip) {
    pageFlip.flipPrev();
  }
});

/* Next page */
nextBtn.addEventListener("click", () => {
  if (pageFlip) {
    pageFlip.flipNext();
  }
});

/*
  Zoom button:
  Desktop fullscreen: toggles centered zoom.
  Mobile: toggles centered zoom too.
*/
zoomBtn.addEventListener("click", () => {
  if (!isMobileView() && !document.fullscreenElement) {
    return;
  }

  if (visualZoom === 1) {
    zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 1.35);
  } else {
    resetVisualZoom();
  }
});

/* Sound button */
soundBtn.addEventListener("click", () => {
  unlockAudio();

  soundEnabled = !soundEnabled;
  updateSoundButton();
});

/* Fullscreen button */
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

/* Rebuild book after entering/exiting fullscreen */
document.addEventListener("fullscreenchange", () => {
  const targetPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;

  if (document.fullscreenElement) {
    fullscreenBtn.textContent = "🗗";
  } else {
    fullscreenBtn.textContent = "⛶";
    visualZoom = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    stopZoomPan();
  }

  setTimeout(() => {
    buildFlipbook(targetPageIndex);
  }, 250);
});

/*
  Desktop smooth trackpad pinch zoom:
  Trackpad pinch usually fires wheel + ctrlKey in desktop browsers.
  Zoom happens around the pointer location.
*/
document.addEventListener(
  "wheel",
  (event) => {
    if (!document.fullscreenElement) return;
    if (isMobileView()) return;
    if (!event.ctrlKey) return;

    event.preventDefault();

    /*
      Exponential zoom factor feels smoother than fixed step zoom.
      Negative deltaY = zoom in. Positive deltaY = zoom out.
    */
    const zoomFactor = Math.exp(-event.deltaY * 0.002);

    zoomAtPoint(event.clientX, event.clientY, zoomFactor);
  },
  { passive: false }
);

/*
  Desktop drag/pan the zoomed book.
  When zoomed in, dragging the book moves it around instead of flipping pages.
*/
bookShell.addEventListener(
  "pointerdown",
  (event) => {
    if (isMobileView()) return;
    if (!isZoomPanActive()) return;

    const clickedInsideBook = event.target.closest("#book");
    if (!clickedInsideBook) return;

    event.preventDefault();
    event.stopPropagation();

    isPanningZoomedBook = true;
    lastPanClientX = event.clientX;
    lastPanClientY = event.clientY;

    bookElement.classList.add("is-panning");

    if (bookShell.setPointerCapture) {
      try {
        bookShell.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture errors.
      }
    }
  },
  true
);

document.addEventListener(
  "pointermove",
  (event) => {
    if (!isPanningZoomedBook) return;
    if (isMobileView()) return;

    event.preventDefault();

    const deltaX = event.clientX - lastPanClientX;
    const deltaY = event.clientY - lastPanClientY;

    zoomPanX += deltaX;
    zoomPanY += deltaY;

    lastPanClientX = event.clientX;
    lastPanClientY = event.clientY;

    applyVisualZoom();
  },
  { passive: false }
);

document.addEventListener("pointerup", stopZoomPan);
document.addEventListener("pointercancel", stopZoomPan);

/*
  Mobile pinch zoom and pan.
  Normal mobile mode:
  - 1 finger = PageFlip handles page turn

  Zoomed mobile mode:
  - 2 fingers = pinch zoom
  - 1 finger = pan/move around zoomed page
*/
bookShell.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobileView()) return;

    const touchedInsideBook = event.target.closest("#book");
    if (!touchedInsideBook) return;

    if (event.touches.length === 2) {
      event.preventDefault();
      event.stopPropagation();

      isMobilePinching = true;
      isPanningZoomedBook = false;

      initialPinchDistance = getTouchDistance(event.touches);
      initialPinchZoom = visualZoom;

      if (bookElement) {
        bookElement.classList.remove("is-panning");
      }

      return;
    }

    if (event.touches.length === 1 && isZoomPanActive()) {
      event.preventDefault();
      event.stopPropagation();

      isPanningZoomedBook = true;
      lastPanClientX = event.touches[0].clientX;
      lastPanClientY = event.touches[0].clientY;

      bookElement.classList.add("is-panning");
    }
  },
  { passive: false, capture: true }
);

bookShell.addEventListener(
  "touchmove",
  (event) => {
    if (!isMobileView()) return;

    if (isMobilePinching && event.touches.length === 2) {
      event.preventDefault();
      event.stopPropagation();

      const currentDistance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);

      if (initialPinchDistance <= 0) return;

      const pinchRatio = currentDistance / initialPinchDistance;
      const targetZoom = initialPinchZoom * pinchRatio;

      zoomToPoint(center.x, center.y, targetZoom);
      return;
    }

    if (isPanningZoomedBook && event.touches.length === 1 && isZoomPanActive()) {
      event.preventDefault();
      event.stopPropagation();

      const touch = event.touches[0];

      const deltaX = touch.clientX - lastPanClientX;
      const deltaY = touch.clientY - lastPanClientY;

      zoomPanX += deltaX;
      zoomPanY += deltaY;

      lastPanClientX = touch.clientX;
      lastPanClientY = touch.clientY;

      applyVisualZoom();
    }
  },
  { passive: false, capture: true }
);

bookShell.addEventListener(
  "touchend",
  (event) => {
    if (!isMobileView()) return;

    if (isMobilePinching && event.touches.length < 2) {
      stopMobilePinch();
    }

    if (event.touches.length === 0) {
      stopZoomPan();
    }

    /*
      If pinch ends with one finger still touching and zoom is active,
      allow that remaining finger to continue panning.
    */
    if (event.touches.length === 1 && isZoomPanActive()) {
      isPanningZoomedBook = true;
      lastPanClientX = event.touches[0].clientX;
      lastPanClientY = event.touches[0].clientY;

      bookElement.classList.add("is-panning");
    }
  },
  { passive: false, capture: true }
);

bookShell.addEventListener(
  "touchcancel",
  () => {
    stopMobilePinch();
    stopZoomPan();
  },
  { passive: false, capture: true }
);

/* Rebuild on resize/orientation change only after the user stops resizing */
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    const targetPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;

    visualZoom = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    stopZoomPan();
    stopMobilePinch();

    buildFlipbook(targetPageIndex);
  }, 300);
});


function getDriverFunction() {
  /*
    Driver.js CDN exposes the function under window.driver.js.driver.
    This fallback keeps it safer if the global changes slightly.
  */
  if (window.driver && window.driver.js && window.driver.js.driver) {
    return window.driver.js.driver;
  }

  if (window.driver && window.driver.driver) {
    return window.driver.driver;
  }

  if (typeof window.driver === "function") {
    return window.driver;
  }

  return null;
}

function startUserTour() {
  const driverFunction = getDriverFunction();

  if (!driverFunction) {
    console.warn("Driver.js was not loaded.");
    return;
  }

  const driverObj = driverFunction({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.62,
    smoothScroll: false,
    allowClose: true,
    stagePadding: 8,
    stageRadius: 12,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps: [
      {
        element: "#tourTitle",
        popover: {
          title: "Welcome to Thread",
          description: "This is your interactive magazine viewer. You can flip pages, zoom in, enable sound, and open fullscreen mode.",
          side: "bottom",
          align: "start"
        }
      },
      {
        element: "#pageCounter",
        popover: {
          title: "Page Counter",
          description: "This shows which page or page spread you are currently viewing.",
          side: "bottom",
          align: "start"
        }
      },
      {
        element: "#prevBtn",
        popover: {
          title: "Previous Page",
          description: "Use this arrow to go back to the previous page.",
          side: "right",
          align: "center"
        }
      },
      {
        element: "#nextBtn",
        popover: {
          title: "Next Page",
          description: "Use this arrow to move forward through the magazine.",
          side: "left",
          align: "center"
        }
      },
      {
        element: "#soundBtn",
        popover: {
          title: "Sound Toggle",
          description: "Turn the page-flip sound on or off.",
          side: "top",
          align: "center"
        }
      },
      {
        element: "#zoomBtn",
        popover: {
          title: "Zoom",
          description: "Use this to zoom in. On desktop fullscreen, you can also pinch with the trackpad. On mobile, use two fingers to pinch zoom.",
          side: "top",
          align: "center"
        }
      },
      {
        element: "#fullscreenBtn",
        popover: {
          title: "Fullscreen",
          description: "Open the magazine in fullscreen mode for a cleaner reading experience.",
          side: "top",
          align: "center"
        }
      },
      {
        element: "#tourBtn",
        popover: {
          title: "Guide",
          description: "You can click this button anytime to replay this quick guide.",
          side: "top",
          align: "center"
        }
      }
    ]
  });

  driverObj.drive();
}

const tourBtn = document.getElementById("tourBtn");

if (tourBtn) {
  tourBtn.addEventListener("click", () => {
    startUserTour();
  });
}

/*
  Auto-start the tour only once for each visitor.
*/
window.addEventListener("load", () => {
  const hasSeenTour = localStorage.getItem("threadFlipbookTourSeen");

  if (!hasSeenTour) {
    setTimeout(() => {
      startUserTour();
      localStorage.setItem("threadFlipbookTourSeen", "true");
    }, 900);
  }
});

/* Initial setup */
buildFlipbook(0);
updateSoundButton();