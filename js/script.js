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
const PLAY_BUTTON_URL = "https://example.com";

const tocToggle = document.getElementById("tocToggle");
const tocPanel = document.getElementById("tocPanel");
const tocClose = document.getElementById("tocClose");
const tocBackdrop = document.getElementById("tocBackdrop");
const tocItems = document.querySelectorAll(".toc-item");

const pageFlipAudio = new Audio("assets/page-flip.mp3");
pageFlipAudio.preload = "auto";
pageFlipAudio.volume = 0.45;

let soundEnabled = true;
let suppressFlipSound = false;
let audioUnlocked = false;

const BASE_PAGE_WIDTH = 390;
const BASE_PAGE_HEIGHT = 550;

let pageFlip = null;
let bookElement = null;

let currentPageWidth = BASE_PAGE_WIDTH;
let currentPageHeight = BASE_PAGE_HEIGHT;

let resizeTimer = null;

let visualZoom = 1;
let zoomPanX = 0;
let zoomPanY = 0;

let isPanningZoomedBook = false;
let lastPanClientX = 0;
let lastPanClientY = 0;

let isMobilePinching = false;
let initialPinchDistance = 0;
let initialPinchZoom = 1;
let mobileGestureStartedOnBook = false;

function isMobileView() {
  return window.matchMedia("(max-width: 768px)").matches;
}

// Determine whether to use portrait (single-page) mode based on available width
function shouldUsePortrait() {
  if (isMobileView()) return true;
  const availableWidth = window.innerWidth - 110; // same margin as getLayoutScale
  return availableWidth < BASE_PAGE_WIDTH * 2;    // not enough room for a two‑page spread
}

function recreateBookContainer() {
  bookShell.innerHTML = "";

  bookElement = document.createElement("div");
  bookElement.id = "book";

  bookShell.appendChild(bookElement);
}

function createPageElements() {
  magazinePages.forEach((pageSrc, index) => {
    const pageNumber = index + 1;

    const page = document.createElement("div");
    page.className = "page";

    const img = document.createElement("img");
    img.src = pageSrc;
    img.alt = `Page ${pageNumber}`;

    page.appendChild(img);

    /*
      Add Play button only on page 28.
    */
    if (pageNumber === 26) {
      const playButton = document.createElement("button");
      playButton.className = "page-play-button";
      playButton.type = "button";
      playButton.textContent = "Play";
      playButton.setAttribute("aria-label", "Play");

      playButton.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });

      playButton.addEventListener("touchstart", (event) => {
        event.stopPropagation();
      }, { passive: true });

      playButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        window.open(PLAY_BUTTON_URL, "_blank", "noopener,noreferrer");
      });

      page.appendChild(playButton);
    }

    bookElement.appendChild(page);
  });
}

function getLayoutScale() {
  const isFullscreen = !!document.fullscreenElement;
  const isMobile = isMobileView();

  let scale = 1;

  if (isMobile) {
    const availableWidth = window.innerWidth - 42;
    const availableHeight = window.innerHeight - 150;

    scale = Math.min(
      availableWidth / BASE_PAGE_WIDTH,
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 1.05);
    scale = Math.max(scale, 0.55);
  } else if (isFullscreen) {
    const availableWidth = window.innerWidth - 90;
    const availableHeight = window.innerHeight - 135;

    scale = Math.min(
      availableWidth / (BASE_PAGE_WIDTH * 2),
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 2.2);
    scale = Math.max(scale, 1);
  } else {
    const availableWidth = window.innerWidth - 110;
    const availableHeight = window.innerHeight - 145;

    scale = Math.min(
      availableWidth / (BASE_PAGE_WIDTH * 2),
      availableHeight / BASE_PAGE_HEIGHT
    );

    scale = Math.min(scale, 3);      // your increased cap
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
    // Browser may block sound until user interacts.
  });
}

function updateSoundButton() {
  soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  soundBtn.title = soundEnabled ? "Sound on" : "Sound off";
}

document.addEventListener("pointerdown", unlockAudio, { once: true });

function buildFlipbook(targetPageIndex = 0) {
  const portraitMode = shouldUsePortrait();

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
    size: "fixed",

    showCover: !portraitMode,
    usePortrait: portraitMode,

    useMouseEvents: true,

    mobileScrollSupport: false,
    drawShadow: true,
    flippingTime: portraitMode ? 650 : 700,
    autoSize: false,               // we control sizing manually
    maxShadowOpacity: portraitMode ? 0.35 : 0.5
  });

  pageFlip.loadFromHTML(document.querySelectorAll("#book .page"));

  pageFlip.on("flip", () => {
    updatePageCounter();
    syncBookLayout();
    highlightActiveTocItem();
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
    highlightActiveTocItem();

    setTimeout(() => {
      suppressFlipSound = false;
    }, 350);
  }, 150);
}

function updatePageCounter() {
  if (!pageFlip) return;

  const portraitMode = shouldUsePortrait();
  const currentPage = pageFlip.getCurrentPageIndex() + 1;
  const totalPages = magazinePages.length;

  if (portraitMode || currentPage === 1) {
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

/* Slide-out contents navigation */
function openToc() {
  if (!tocPanel || !tocToggle || !tocBackdrop) return;

  tocPanel.classList.add("is-open");
  tocToggle.classList.add("is-open");
  tocBackdrop.classList.add("is-open");

  tocToggle.textContent = "❮";
  tocToggle.setAttribute("aria-label", "Close contents");
}

function closeToc() {
  if (!tocPanel || !tocToggle || !tocBackdrop) return;

  tocPanel.classList.remove("is-open");
  tocToggle.classList.remove("is-open");
  tocBackdrop.classList.remove("is-open");

  tocToggle.textContent = "❯";
  tocToggle.setAttribute("aria-label", "Open contents");
}

function toggleToc() {
  if (!tocPanel) return;

  if (tocPanel.classList.contains("is-open")) {
    closeToc();
  } else {
    openToc();
  }
}

function goToMagazinePage(pageNumber) {
  if (!pageFlip) return;

  const pageIndex = Math.max(
    0,
    Math.min(pageNumber - 1, magazinePages.length - 1)
  );

  resetVisualZoom();

  suppressFlipSound = true;

  if (typeof pageFlip.turnToPage === "function") {
    pageFlip.turnToPage(pageIndex);
  }

  setTimeout(() => {
    updatePageCounter();
    syncBookLayout();
    highlightActiveTocItem();
    suppressFlipSound = false;
  }, 250);

  closeToc();
}

function highlightActiveTocItem() {
  if (!pageFlip || !tocItems || tocItems.length === 0) return;

  const portraitMode = shouldUsePortrait();
  const currentPageNumber = pageFlip.getCurrentPageIndex() + 1;

  const visiblePages = new Set([currentPageNumber]);

  if (!portraitMode && currentPageNumber > 1) {
    visiblePages.add(Math.min(currentPageNumber + 1, magazinePages.length));
  }

  tocItems.forEach((item) => {
    const targetPage = Number(item.dataset.page);

    if (visiblePages.has(targetPage)) {
      item.classList.add("is-active");
    } else {
      item.classList.remove("is-active");
    }
  });
}

function syncBookLayout() {
  if (!pageFlip) return;

  const portraitMode = shouldUsePortrait();
  const currentPageIndex = pageFlip.getCurrentPageIndex();
  const isFullscreen = !!document.fullscreenElement;

  const isDesktopSpread = !portraitMode && currentPageIndex > 0;

  const bookShiftX = portraitMode
    ? 0
    : isDesktopSpread
      ? 0
      : -(currentPageWidth / 2);

  bookShell.style.setProperty("--book-shift-x", `${bookShiftX}px`);

  if (portraitMode) {
    document.documentElement.style.setProperty("--left-arrow-x", "24px");
    document.documentElement.style.setProperty(
      "--right-arrow-x",
      `${window.innerWidth - 24}px`
    );
    return;
  }

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

  const portraitMode = shouldUsePortrait();
  const currentPageIndex = pageFlip.getCurrentPageIndex();
  const isDesktopSpread = !portraitMode && currentPageIndex > 0;

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

function stopMobileTouchEvent(event) {
  event.preventDefault();
  event.stopPropagation();

  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function didTouchStartInsideBook(event) {
  return !!(
    event.target &&
    event.target.closest &&
    event.target.closest("#book")
  );
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
  Keyboard page navigation.
  Left Arrow  = previous page
  Right Arrow = next page
*/
document.addEventListener("keydown", (event) => {
  if (!pageFlip) return;

  const isTourOpen = !!document.querySelector(".driver-popover");
  if (isTourOpen) return;

  const isTocOpen = tocPanel && tocPanel.classList.contains("is-open");

  if (event.key === "Escape" && isTocOpen) {
    event.preventDefault();
    closeToc();
    return;
  }

  if (isTocOpen) return;

  const activeElement = document.activeElement;
  const isTyping =
    activeElement &&
    (
      activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.tagName === "SELECT" ||
      activeElement.isContentEditable
    );

  if (isTyping) return;

  if (event.repeat) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    pageFlip.flipNext();
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    pageFlip.flipPrev();
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
    mobileGestureStartedOnBook = false;
    stopZoomPan();
  }

  setTimeout(() => {
    buildFlipbook(targetPageIndex);
  }, 250);
});

/*
  Desktop smooth trackpad pinch zoom.
*/
document.addEventListener(
  "wheel",
  (event) => {
    if (!document.fullscreenElement) return;
    if (isMobileView()) return;
    if (!event.ctrlKey) return;

    event.preventDefault();

    const zoomFactor = Math.exp(-event.deltaY * 0.002);

    zoomAtPoint(event.clientX, event.clientY, zoomFactor);
  },
  { passive: false }
);

/*
  Desktop drag/pan the zoomed book.
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
  Strong mobile pinch zoom and pan.
  This listens on document in capture mode so it catches pinch gestures
  before PageFlip treats them as page flips.
*/
document.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobileView()) return;

    const touchedInsideBook = didTouchStartInsideBook(event);

    if (event.touches.length >= 2 && touchedInsideBook) {
      stopMobileTouchEvent(event);

      mobileGestureStartedOnBook = true;
      isMobilePinching = true;
      isPanningZoomedBook = false;

      initialPinchDistance = getTouchDistance(event.touches);
      initialPinchZoom = visualZoom;

      if (bookElement) {
        bookElement.classList.remove("is-panning");
      }

      return;
    }

    if (event.touches.length === 1 && touchedInsideBook && isZoomPanActive()) {
      stopMobileTouchEvent(event);

      mobileGestureStartedOnBook = true;
      isPanningZoomedBook = true;

      lastPanClientX = event.touches[0].clientX;
      lastPanClientY = event.touches[0].clientY;

      if (bookElement) {
        bookElement.classList.add("is-panning");
      }
    }
  },
  { passive: false, capture: true }
);

document.addEventListener(
  "touchmove",
  (event) => {
    if (!isMobileView()) return;

    if (
      (mobileGestureStartedOnBook || didTouchStartInsideBook(event)) &&
      event.touches.length >= 2
    ) {
      stopMobileTouchEvent(event);

      if (!isMobilePinching) {
        isMobilePinching = true;
        isPanningZoomedBook = false;

        initialPinchDistance = getTouchDistance(event.touches);
        initialPinchZoom = visualZoom;

        if (bookElement) {
          bookElement.classList.remove("is-panning");
        }
      }

      const currentDistance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);

      if (initialPinchDistance <= 0) return;

      const pinchRatio = currentDistance / initialPinchDistance;
      const targetZoom = initialPinchZoom * pinchRatio;

      zoomToPoint(center.x, center.y, targetZoom);
      return;
    }

    if (isPanningZoomedBook && event.touches.length === 1 && isZoomPanActive()) {
      stopMobileTouchEvent(event);

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

document.addEventListener(
  "touchend",
  (event) => {
    if (!isMobileView()) return;

    if (mobileGestureStartedOnBook || isMobilePinching || isPanningZoomedBook) {
      stopMobileTouchEvent(event);
    }

    if (isMobilePinching && event.touches.length < 2) {
      stopMobilePinch();
    }

    if (event.touches.length === 0) {
      mobileGestureStartedOnBook = false;
      stopZoomPan();
    }

    if (event.touches.length === 1 && isZoomPanActive()) {
      mobileGestureStartedOnBook = true;
      isPanningZoomedBook = true;

      lastPanClientX = event.touches[0].clientX;
      lastPanClientY = event.touches[0].clientY;

      if (bookElement) {
        bookElement.classList.add("is-panning");
      }
    }
  },
  { passive: false, capture: true }
);

document.addEventListener(
  "touchcancel",
  (event) => {
    if (!isMobileView()) return;

    if (mobileGestureStartedOnBook || isMobilePinching || isPanningZoomedBook) {
      stopMobileTouchEvent(event);
    }

    mobileGestureStartedOnBook = false;
    stopMobilePinch();
    stopZoomPan();
  },
  { passive: false, capture: true }
);

/* Slide-out contents navigation */
if (tocToggle) {
  tocToggle.addEventListener("click", () => {
    toggleToc();
  });
}

if (tocClose) {
  tocClose.addEventListener("click", () => {
    closeToc();
  });
}

if (tocBackdrop) {
  tocBackdrop.addEventListener("click", () => {
    closeToc();
  });
}

tocItems.forEach((item) => {
  item.addEventListener("click", () => {
    const pageNumber = Number(item.dataset.page);

    if (!Number.isNaN(pageNumber)) {
      goToMagazinePage(pageNumber);
    }
  });
});

/* Rebuild on resize/orientation change only after the user stops resizing */
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    const targetPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;

    visualZoom = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    mobileGestureStartedOnBook = false;
    stopZoomPan();
    stopMobilePinch();
    closeToc();

    buildFlipbook(targetPageIndex);
  }, 300);
});

function getDriverFunction() {
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

  closeToc();

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
        element: "#tocToggle",
        popover: {
          title: "Contents Navigation",
          description: "Open the contents panel and jump directly to any section of the magazine.",
          side: "right",
          align: "center"
        }
      },
      {
        element: "#prevBtn",
        popover: {
          title: "Previous Page",
          description: "Use this arrow or the left keyboard arrow to go back.",
          side: "right",
          align: "center"
        }
      },
      {
        element: "#nextBtn",
        popover: {
          title: "Next Page",
          description: "Use this arrow or the right keyboard arrow to move forward.",
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
          description: "Click this button anytime to replay this quick guide.",
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

setTimeout(() => {
  highlightActiveTocItem();
}, 300);