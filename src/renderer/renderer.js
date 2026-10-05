(function startPet() {
  'use strict';

  const CELL_WIDTH = 192;
  const CELL_HEIGHT = 208;
  const MOUSE_SETTLE_MS = 750;
  const KEYBOARD_GRACE_MS = 1400;
  const SLEEP_AFTER_SECONDS = 15;
  const ARRIVAL_TOLERANCE = 10;
  const WALK_STEP = 5;
  const WALK_INTERVAL_MS = 40;

  const {
    ANIMATIONS,
    vectorToDirectionIndex,
    directionToCell,
    correctedLookColumn,
    horizontalDirection,
    reachableTargetCenterX
  } = globalThis.PetCore;
  const canvas = document.getElementById('pet');
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const api = globalThis.petApi;

  const pendingAssets = {
    big: {
      atlas: loadImage('../../assets/just-big-cat.png'),
      sitting: loadImage('../../assets/just-big-sit.png'),
      lookUp: loadImage('../../assets/just-big-look-up.png')
    },
    alien: {
      atlas: loadImage('../../assets/just-alien-cat.png'),
      sitting: loadImage('../../assets/just-alien-sit.png'),
      lookUp: loadImage('../../assets/just-alien-look-up.png')
    },
    minbird: {
      atlas: loadImage('../../assets/just-minbird.png'),
      sitting: loadImage('../../assets/just-minbird-rest.png'),
      lookUp: loadImage('../../assets/just-minbird-look-up.png')
    }
  };

  const assets = { big: null, alien: null, minbird: null };
  let settings = null;
  let activeAtlas = null;
  let activeSitting = null;
  let activeLookUp = null;
  let ready = false;
  let mode = 'idle';
  let animationName = 'idle';
  let frame = 0;
  let loopsRemaining = Infinity;
  let nextFrameAt = 0;
  let animationFlipped = false;
  let walkTimer = null;
  let walkBusy = false;
  let walkDirection = 0;
  let cursorBusy = false;
  let lastCursorValue = null;
  let lastCursorPoint = null;
  let lastMouseMoveAt = performance.now();
  let lastIdleSeconds = null;
  let keyboardActiveUntil = 0;
  let manualHoldUntil = 0;
  let manualSleep = false;
  let press = null;
  let dragging = false;
  let suppressClick = false;
  let clickTimer = null;
  let clickThrough = false;
  let lastHitTest = 0;
  const debugState = {
    animationTicks: 0,
    pollAttempts: 0,
    pollSuccesses: 0,
    walkStarts: 0,
    walkSteps: 0,
    lastPollError: null,
    lastDirection: 0,
    lastTargetCenterX: null
  };

  globalThis.__petDebugSnapshot = () => ({
    ...debugState,
    ready,
    mode,
    animationName,
    frame,
    walkDirection,
    hasWalkTimer: Boolean(walkTimer),
    settings: settings ? { ...settings } : null,
    lastCursorValue
  });

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function clearCanvas() {
    context.clearRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
  }

  function drawAtlasRegion(sourceX, sourceY, sourceWidth, sourceHeight, destinationX, destinationY, flipped = false) {
    if (!activeAtlas) return;
    context.save();
    if (flipped) {
      context.translate(CELL_WIDTH, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      activeAtlas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      sourceWidth,
      sourceHeight
    );
    context.restore();
  }

  function renderCell(row, column, flipped = false) {
    clearCanvas();
    drawAtlasRegion(
      column * CELL_WIDTH,
      row * CELL_HEIGHT,
      CELL_WIDTH,
      CELL_HEIGHT,
      0,
      0,
      flipped
    );
  }

  function renderLookIndex(index) {
    if (!activeAtlas || !Number.isInteger(index)) return;
    clearCanvas();
    const correctedColumn = correctedLookColumn(index);
    if (correctedColumn !== null && activeLookUp) {
      context.drawImage(
        activeLookUp,
        correctedColumn * CELL_WIDTH,
        0,
        CELL_WIDTH,
        CELL_HEIGHT,
        0,
        0,
        CELL_WIDTH,
        CELL_HEIGHT
      );
    } else {
      const cell = directionToCell(index);
      if (!cell) return;
      drawAtlasRegion(
        cell.column * CELL_WIDTH,
        cell.row * CELL_HEIGHT,
        CELL_WIDTH,
        CELL_HEIGHT,
        0,
        0
      );
    }
    mode = 'look';
  }

  function renderLook(cursor, bounds) {
    if (!cursor || !bounds) return;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const index = vectorToDirectionIndex(cursor.x - centerX, cursor.y - centerY);
    if (index !== null) renderLookIndex(index);
  }

  function renderSitting(manual = false) {
    if (!activeSitting) return;
    clearWalk();
    clearCanvas();
    context.drawImage(activeSitting, 0, 0, CELL_WIDTH, CELL_HEIGHT);
    mode = 'sit';
    manualSleep = false;
    manualHoldUntil = manual ? performance.now() + 5000 : 0;
  }

  function setAnimation(name, nextMode = 'idle', loops = Infinity, flipped = false) {
    const animation = ANIMATIONS[name];
    if (!animation) return;
    animationName = name;
    mode = nextMode;
    loopsRemaining = loops;
    animationFlipped = flipped;
    frame = 0;
    nextFrameAt = performance.now() + animation.durations[0];
    renderCell(animation.row, frame, animationFlipped);
  }

  function setIdle() {
    manualHoldUntil = 0;
    setAnimation('idle', 'idle', Infinity);
  }

  function finishFiniteAnimation() {
    setIdle();
  }

  function animationTick(now) {
    debugState.animationTicks += 1;
    if (ready && mode !== 'look' && mode !== 'sit' && mode !== 'sleepHold') {
      const animation = ANIMATIONS[animationName];
      if (animation && now >= nextFrameAt) {
        frame += 1;
        if (frame >= animation.frames) {
          if (mode === 'action') {
            loopsRemaining -= 1;
            if (loopsRemaining <= 0) {
              finishFiniteAnimation();
              requestAnimationFrame(animationTick);
              return;
            }
          } else if (mode === 'sleepTransition') {
            frame = animation.frames - 1;
            mode = 'sleepHold';
            requestAnimationFrame(animationTick);
            return;
          }
          frame = 0;
        }
        nextFrameAt = now + animation.durations[frame];
        renderCell(animation.row, frame, animationFlipped);
      }
    }
    requestAnimationFrame(animationTick);
  }

  function clearWalk() {
    clearInterval(walkTimer);
    walkTimer = null;
    walkBusy = false;
    walkDirection = 0;
  }

  function isTyping(now = performance.now()) {
    return now < keyboardActiveUntil;
  }

  function arriveAtCursor() {
    clearWalk();
    if (isTyping()) renderSitting(false);
    else setIdle();
  }

  async function walkStep() {
    if (walkBusy || mode !== 'walk' || !lastCursorValue) return;
    walkBusy = true;
    try {
      const { cursor, bounds, workArea } = lastCursorValue;
      const centerX = bounds.x + bounds.width / 2;
      const targetCenterX = reachableTargetCenterX(cursor.x, bounds, workArea);
      const direction = horizontalDirection(centerX, targetCenterX, ARRIVAL_TOLERANCE);
      debugState.walkSteps += 1;
      debugState.lastDirection = direction;
      debugState.lastTargetCenterX = targetCenterX;
      if (direction === 0) {
        arriveAtCursor();
        return;
      }
      if (direction !== walkDirection) {
        walkDirection = direction;
        setAnimation('walking', 'walk', Infinity, direction < 0);
      }
      const remaining = Math.abs(targetCenterX - centerX) - ARRIVAL_TOLERANCE;
      const delta = direction * Math.max(1, Math.min(WALK_STEP, remaining));
      const result = await api.stepMove(delta, 0);
      if (result?.bounds) lastCursorValue = { ...lastCursorValue, bounds: result.bounds };
      if (result?.hitBoundary) arriveAtCursor();
    } finally {
      walkBusy = false;
    }
  }

  function startWalk(direction) {
    if (!direction || dragging) return;
    manualHoldUntil = 0;
    manualSleep = false;
    if (mode === 'walk' && walkDirection === direction && walkTimer) return;
    clearWalk();
    debugState.walkStarts += 1;
    walkDirection = direction;
    setAnimation('walking', 'walk', Infinity, direction < 0);
    walkTimer = setInterval(walkStep, WALK_INTERVAL_MS);
  }

  function startSleep(manual = false) {
    if (mode === 'sleepTransition' || mode === 'sleepHold') {
      manualSleep = manualSleep || manual;
      return;
    }
    clearWalk();
    manualHoldUntil = 0;
    manualSleep = manual;
    setAnimation('sleeping', 'sleepTransition', 1);
  }

  function wakeUp() {
    manualSleep = false;
    setIdle();
  }

  function playAction(action) {
    if (dragging) return;
    if (action === 'waving') {
      clearWalk();
      manualHoldUntil = 0;
      manualSleep = false;
      setAnimation('waving', 'action', 1);
    } else if (action === 'sitting') {
      renderSitting(true);
    } else if (action === 'sleeping') {
      startSleep(true);
    }
  }

  async function pollInput() {
    if (!ready || dragging || cursorBusy) return;
    debugState.pollAttempts += 1;
    cursorBusy = true;
    try {
      const value = await api.getCursor();
      if (!value?.cursor || !value?.bounds) return;
      debugState.pollSuccesses += 1;
      debugState.lastPollError = null;
      const now = performance.now();
      const idleSeconds = Number.isFinite(value.idleSeconds) ? value.idleSeconds : 0;
      const mouseMoved = Boolean(
        lastCursorPoint
        && (value.cursor.x !== lastCursorPoint.x || value.cursor.y !== lastCursorPoint.y)
      );
      const idleReset = lastIdleSeconds !== null && idleSeconds < lastIdleSeconds;
      const sustainedZero = idleSeconds === 0 && now - lastMouseMoveAt > 1150;
      const keyboardDetected = !mouseMoved
        && now - lastMouseMoveAt > 250
        && (idleReset || sustainedZero);

      lastCursorValue = value;
      lastCursorPoint = { ...value.cursor };
      lastIdleSeconds = idleSeconds;

      if (mouseMoved) {
        lastMouseMoveAt = now;
        keyboardActiveUntil = 0;
        manualHoldUntil = 0;
        manualSleep = false;
        if (mode === 'sleepTransition' || mode === 'sleepHold') wakeUp();
        if (mode === 'walk') clearWalk();
        if (mode !== 'action' && mode !== 'drag') renderLook(value.cursor, value.bounds);
        return;
      }

      if (keyboardDetected) {
        keyboardActiveUntil = now + KEYBOARD_GRACE_MS;
        manualHoldUntil = 0;
        if (manualSleep) wakeUp();
      }

      if (manualSleep && (mode === 'sleepTransition' || mode === 'sleepHold')) return;
      if (manualHoldUntil > now) return;

      if (idleSeconds >= SLEEP_AFTER_SECONDS) {
        startSleep(false);
        return;
      }

      if (mode === 'sleepTransition' || mode === 'sleepHold') wakeUp();
      if (mode === 'action' || mode === 'drag') return;

      if (!settings?.smartFollow) {
        if (mode === 'walk') clearWalk();
        if (mode === 'look' || mode === 'walk' || mode === 'sit') setIdle();
        return;
      }

      const typing = isTyping(now);
      const mouseHasSettled = now - lastMouseMoveAt >= MOUSE_SETTLE_MS;
      if (!typing && !mouseHasSettled) return;

      const centerX = value.bounds.x + value.bounds.width / 2;
      const targetCenterX = reachableTargetCenterX(value.cursor.x, value.bounds, value.workArea);
      const direction = horizontalDirection(centerX, targetCenterX, ARRIVAL_TOLERANCE);
      debugState.lastDirection = direction;
      debugState.lastTargetCenterX = targetCenterX;
      if (direction !== 0) {
        startWalk(direction);
      } else if (typing) {
        if (mode !== 'sit') renderSitting(false);
      } else if (mode === 'look' || mode === 'sit' || mode === 'walk') {
        if (mode === 'walk') clearWalk();
        setIdle();
      }
    } catch (error) {
      debugState.lastPollError = error instanceof Error ? error.message : String(error);
      console.error('Desktop pet input polling failed:', error);
    } finally {
      cursorBusy = false;
    }
  }

  function setClickThrough(enabled) {
    if (clickThrough === enabled) return;
    clickThrough = enabled;
    api.setClickThrough(enabled);
  }

  function updateHitTest(event) {
    const now = performance.now();
    if (!ready || press || now - lastHitTest < 45) return;
    lastHitTest = now;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(CELL_WIDTH - 1, Math.floor(((event.clientX - rect.left) / rect.width) * CELL_WIDTH)));
    const y = Math.max(0, Math.min(CELL_HEIGHT - 1, Math.floor(((event.clientY - rect.top) / rect.height) * CELL_HEIGHT)));
    const alpha = context.getImageData(x, y, 1, 1).data[3];
    setClickThrough(alpha < 16);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setClickThrough(false);
    press = {
      pointerId: event.pointerId,
      offsetX: event.clientX,
      offsetY: event.clientY,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      lastScreenX: event.screenX
    };
    dragging = false;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!press) {
      updateHitTest(event);
      return;
    }

    const moved = Math.hypot(event.screenX - press.startScreenX, event.screenY - press.startScreenY);
    if (!dragging && moved >= 4) {
      dragging = true;
      suppressClick = true;
      canvas.classList.add('dragging');
      clearWalk();
      manualHoldUntil = 0;
      manualSleep = false;
    }

    if (dragging) {
      const horizontalDelta = event.screenX - press.lastScreenX;
      if (Math.abs(horizontalDelta) >= 1) {
        const direction = horizontalDelta > 0 ? 1 : -1;
        if (mode !== 'drag' || walkDirection !== direction) {
          walkDirection = direction;
          setAnimation('walking', 'drag', Infinity, direction < 0);
        }
      }
      press.lastScreenX = event.screenX;
      api.dragTo(event.screenX - press.offsetX, event.screenY - press.offsetY);
    }
  });

  function finishPointer(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (dragging) {
      api.dragEnd();
      canvas.classList.remove('dragging');
      setIdle();
    }
    press = null;
    dragging = false;
  }

  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  canvas.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (event.detail === 1) {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => playAction('waving'), 260);
    } else if (event.detail === 2) {
      clearTimeout(clickTimer);
      api.togglePet();
    }
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    clearTimeout(clickTimer);
    setClickThrough(false);
    api.showMenu();
  });

  window.addEventListener('mousemove', updateHitTest);
  window.addEventListener('blur', () => {
    if (press) {
      press = null;
      dragging = false;
      canvas.classList.remove('dragging');
      api.dragEnd();
      setIdle();
    }
  });

  api.onSettings((nextSettings) => {
    const changedPet = settings?.pet !== nextSettings.pet;
    settings = nextSettings;
    if (changedPet && ready) {
      activeAtlas = assets[nextSettings.pet].atlas;
      activeSitting = assets[nextSettings.pet].sitting;
      activeLookUp = assets[nextSettings.pet].lookUp;
      setIdle();
      playAction('waving');
    }
    if (!nextSettings.smartFollow && mode === 'walk') {
      clearWalk();
      setIdle();
    }
  });

  api.onAction((action) => playAction(action));

  Promise.all([
    api.getState(),
    pendingAssets.big.atlas,
    pendingAssets.big.sitting,
    pendingAssets.big.lookUp,
    pendingAssets.alien.atlas,
    pendingAssets.alien.sitting,
    pendingAssets.alien.lookUp,
    pendingAssets.minbird.atlas,
    pendingAssets.minbird.sitting,
    pendingAssets.minbird.lookUp
  ])
    .then(([
      state,
      bigAtlas,
      bigSitting,
      bigLookUp,
      alienAtlas,
      alienSitting,
      alienLookUp,
      minbirdAtlas,
      minbirdSitting,
      minbirdLookUp
    ]) => {
      assets.big = { atlas: bigAtlas, sitting: bigSitting, lookUp: bigLookUp };
      assets.alien = { atlas: alienAtlas, sitting: alienSitting, lookUp: alienLookUp };
      assets.minbird = { atlas: minbirdAtlas, sitting: minbirdSitting, lookUp: minbirdLookUp };
      settings = state.settings;
      activeAtlas = assets[settings.pet].atlas;
      activeSitting = assets[settings.pet].sitting;
      activeLookUp = assets[settings.pet].lookUp;
      ready = true;
      const smokeLookIndex = settings.smokeLookIndex;
      if (directionToCell(smokeLookIndex)) {
        renderLookIndex(smokeLookIndex);
      } else {
        setIdle();
        playAction('waving');
        setInterval(pollInput, 100);
        pollInput();
      }
      requestAnimationFrame(animationTick);
    })
    .catch((error) => {
      console.error('Desktop pet failed to start:', error);
    });
})();
