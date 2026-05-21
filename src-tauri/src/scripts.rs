/// Injected into every service WebviewWindow before first navigation.
/// Forces dark colour-scheme, overrides matchMedia, and installs the media bridge.
pub const WEBVIEW_DARK_INIT: &str = r#"
(function() {
  // 1. Force dark colour-scheme meta
  var meta = document.createElement('meta');
  meta.name = 'color-scheme';
  meta.content = 'dark';
  document.head.appendChild(meta);

  // 2. Inject baseline dark styles
  var style = document.createElement('style');
  style.textContent = ':root{color-scheme:dark!important}html,body{background:#000!important;color:#f0f0f0!important}';
  document.head.appendChild(style);

  // 3. Override matchMedia so services detect dark mode.
  //    Returns a plain-object wrapper for the dark-mode query — never a MediaQueryList
  //    instance — so callers that do Object.assign() on the result (e.g. MUI, YTM)
  //    don't hit "matches has only a getter" TypeError.
  var _matchMedia = window.matchMedia.bind(window);
  window.matchMedia = function(q) {
    var mql = _matchMedia(q);
    if (q !== '(prefers-color-scheme: dark)') return mql;
    return {
      matches: true,
      media: mql.media,
      onchange: null,
      addListener:         function(cb)           { mql.addListener(cb); },
      removeListener:      function(cb)           { mql.removeListener(cb); },
      addEventListener:    function(t, cb, opts)  { mql.addEventListener(t, cb, opts); },
      removeEventListener: function(t, cb, opts)  { mql.removeEventListener(t, cb, opts); },
      dispatchEvent:       function(evt)          { return mql.dispatchEvent(evt); },
    };
  };

  // 4. Notification bridge — intercept window.Notification and route to native
  (function() {
    if (typeof Notification === 'undefined') return;
    function IngweNotification(title, opts) {
      var body = (opts && opts.body) ? String(opts.body) : '';
      try {
        fetch(
          'ingwe-notify://?title=' + encodeURIComponent(String(title)) +
          '&body=' + encodeURIComponent(body)
        ).catch(function(){});
      } catch(_) {}
    }
    Object.defineProperty(IngweNotification, 'permission', {
      get: function() { return 'granted'; },
      configurable: true
    });
    IngweNotification.requestPermission = function() { return Promise.resolve('granted'); };
    IngweNotification.prototype = Object.create(
      typeof Notification !== 'undefined' ? Notification.prototype : Object.prototype
    );
    window.Notification = IngweNotification;
  })();

  // 5a. MediaSession hook — wrap navigator.mediaSession.setActionHandler so we
  //     can capture and re-invoke the page's registered handlers directly. This
  //     is the same path the browser takes when delivering a hardware media key,
  //     so it works for every site that uses the Media Session API (Spotify,
  //     YouTube Music, Apple Music, Amazon Music, Tidal, Deezer, SoundCloud, …).
  window.__ingweMediaHandlers = window.__ingweMediaHandlers || {};
  (function() {
    try {
      if (!navigator.mediaSession || !navigator.mediaSession.setActionHandler) return;
      if (navigator.mediaSession.__ingweHooked) return;
      navigator.mediaSession.__ingweHooked = true;
      var origSet = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = function(action, handler) {
        if (handler) window.__ingweMediaHandlers[action] = handler;
        else delete window.__ingweMediaHandlers[action];
        return origSet(action, handler);
      };
    } catch(_) {}
  })();
  function callMediaSessionHandler(name) {
    var h = window.__ingweMediaHandlers && window.__ingweMediaHandlers[name];
    if (typeof h !== 'function') return false;
    try { h({ action: name }); return true; } catch(_) { return false; }
  }

  // 5b. Media bridge — called by Rust dispatch_media_key via eval()
  window.__ingweMedia = function(action) {
    // Click the first selector that resolves to an element in the light DOM
    function tryClick(selectors) {
      for (var i = 0; i < selectors.length; i++) {
        try { var el = document.querySelector(selectors[i]); if (el) { el.click(); return true; } } catch(_) {}
      }
      return false;
    }
    // Click inside a specific web-component shadow root (e.g. YouTube Music uses ytmusic-player-bar)
    function tryClickShadow(hostSelector, selectors) {
      try {
        var host = document.querySelector(hostSelector);
        if (!host || !host.shadowRoot) return false;
        for (var i = 0; i < selectors.length; i++) {
          try { var el = host.shadowRoot.querySelector(selectors[i]); if (el) { el.click(); return true; } } catch(_) {}
        }
      } catch(_) {}
      return false;
    }
    // Dispatch a keydown+keyup pair to document and window only — deliberately
    // excluding document.activeElement to avoid misinterpretation by focused containers
    // (e.g. YTM queue panel treating MediaTrackNext as a scroll command)
    function dispatchKey(k) {
      var opts = { key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode,
                   shiftKey: !!k.shiftKey, bubbles: true, cancelable: true };
      [document, window].forEach(function(t) {
        if (!t) return;
        try { t.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch(_) {}
        try { t.dispatchEvent(new KeyboardEvent('keyup',   opts)); } catch(_) {}
      });
    }

    // Deep media element search — pierces shadow DOM for web components (e.g. YouTube Music)
    function findMediaElements() {
      var light = [].slice.call(document.querySelectorAll('video, audio')).filter(function(m) { return !m.error; });
      if (light.length > 0) return light;
      var result = [];
      (function search(root) {
        if (!root) return;
        try {
          [].slice.call(root.querySelectorAll('video, audio')).forEach(function(m) {
            if (!m.error) result.push(m);
          });
          [].slice.call(root.querySelectorAll('*')).forEach(function(el) {
            if (el.shadowRoot) search(el.shadowRoot);
          });
        } catch(_) {}
      })(document);
      return result;
    }

    if (action === 'play') {
      // 0. MediaSession handler — prefer "play"/"pause" depending on whether anything
      //    is currently playing. This is what hardware keys would trigger in a browser.
      var ms = window.__ingweMediaHandlers || {};
      var playing = findMediaElements().some(function(m) { return !m.paused && !m.ended; });
      if (playing && callMediaSessionHandler('pause')) return;
      if (!playing && callMediaSessionHandler('play')) return;
      if (callMediaSessionHandler('playpause')) return;
      // 1. Direct video/audio element toggle (YouTube, Netflix, Disney+, etc.)
      var medias = findMediaElements();
      var active = medias.filter(function(m) { return !m.paused && !m.ended; })[0]
                || medias.filter(function(m) { return m.readyState >= 2; })[0]
                || medias[0];
      if (active) {
        try {
          if (active.paused) active.play().catch(function(){});
          else active.pause();
          return;
        } catch(_) {}
      }
      // 2. Click play/pause button (Spotify, Amazon Music, Apple Music, Tidal, Deezer …)
      if (tryClick([
        '[data-testid="control-button-playpause"]',          // Spotify
        '[data-testid="PlayPauseButton"]',                   // Amazon Music
        '.ytp-play-button',                                  // YouTube embedded player
        '.play-pause-button',                                // YouTube Music (light DOM)
        'tp-yt-paper-icon-button.play-pause-button',         // YouTube Music (Polymer, light DOM)
        '[aria-label="Pause"]', '[aria-label="Play"]',
        '[aria-label="Pause video"]', '[aria-label="Play video"]',
        '[aria-label="Pause song"]',  '[aria-label="Play song"]',
        '[aria-label="Pause music"]', '[aria-label="Play music"]',
        'button[title="Pause"]',      'button[title="Play"]',
        '[class*="PlayPause"]',       '[class*="play-pause"]',
        '[class*="playPause"]'
      ])) return;
      // 2b. YouTube Music — controls live inside ytmusic-player-bar shadow root
      if (tryClickShadow('ytmusic-player-bar', [
        '.play-pause-button', 'tp-yt-paper-icon-button.play-pause-button',
        '[aria-label="Pause"]', '[aria-label="Play"]'
      ])) return;
      // 3. Keyboard fallback
      dispatchKey({ key: 'MediaPlayPause', code: 'MediaPlayPause', keyCode: 179 });
      dispatchKey({ key: ' ', code: 'Space', keyCode: 32 });
      return;
    }

    if (action === 'next') {
      if (callMediaSessionHandler('nexttrack')) return;
      if (tryClick([
        '[data-testid="control-button-skip-forward"]',       // Spotify
        'paper-icon-button.next-button',                     // YouTube Music (light DOM)
        'tp-yt-paper-icon-button.next-button',               // YouTube Music (light DOM alt)
        '.ytp-next-button',                                  // YouTube player
        '[aria-label="Next song"]',    '[aria-label="Next track"]',
        '[aria-label="Next video"]',   '[aria-label="Next"]',
        'button[title="Next song"]',   'button[title="Next track"]',
        'button[title="Next"]',        '[class*="NextButton"]',
        '[class*="next-button"]',      '[class*="nextButton"]'
      ])) return;
      // YouTube Music shadow DOM
      if (tryClickShadow('ytmusic-player-bar', [
        'tp-yt-paper-icon-button.next-button', '.next-button',
        '[aria-label="Next"]', '[aria-label="Next song"]', '[title="Next"]'
      ])) return;
      // YTM keyboard shortcut (Shift+N) — works even when media key events are untrusted
      dispatchKey({ key: 'N', code: 'KeyN', keyCode: 78, shiftKey: true });
      dispatchKey({ key: 'MediaTrackNext', code: 'MediaTrackNext', keyCode: 176 });
      return;
    }

    if (action === 'prev') {
      if (callMediaSessionHandler('previoustrack')) return;
      if (tryClick([
        '[data-testid="control-button-skip-back"]',          // Spotify
        'paper-icon-button.previous-button',                 // YouTube Music (light DOM)
        'tp-yt-paper-icon-button.previous-button',           // YouTube Music (light DOM alt)
        '[aria-label="Previous song"]','[aria-label="Previous track"]',
        '[aria-label="Previous video"]','[aria-label="Previous"]',
        'button[title="Previous song"]','button[title="Previous track"]',
        'button[title="Previous"]',    '[class*="PrevButton"]',
        '[class*="prev-button"]',      '[class*="prevButton"]'
      ])) return;
      // YouTube Music shadow DOM
      if (tryClickShadow('ytmusic-player-bar', [
        'tp-yt-paper-icon-button.previous-button', '.previous-button',
        '[aria-label="Previous"]', '[aria-label="Previous song"]', '[title="Previous"]'
      ])) return;
      // YTM keyboard shortcut (Shift+P) — works even when media key events are untrusted
      dispatchKey({ key: 'P', code: 'KeyP', keyCode: 80, shiftKey: true });
      dispatchKey({ key: 'MediaTrackPrevious', code: 'MediaTrackPrevious', keyCode: 177 });
      return;
    }

    if (action === 'stop') {
      if (callMediaSessionHandler('stop')) return;
      dispatchKey({ key: 'MediaStop', code: 'MediaStop', keyCode: 178 });
    }
  };

  // 7. Physical media key capture — intercepts trusted media key events delivered
  //    by WebView2/WebKit to the DOM when the service webview has focus, and routes
  //    them through __ingweMedia so the same logic applies as the tray / shortcuts.
  window.addEventListener('keydown', function(e) {
    if (!e.isTrusted || !window.__ingweMedia) return;
    var map = { 'MediaPlayPause': 'play', 'MediaTrackNext': 'next', 'MediaTrackPrevious': 'prev', 'MediaStop': 'stop' };
    var a = map[e.key];
    if (!a) return;
    e.stopPropagation(); // prevent the service from double-handling
    e.preventDefault();
    window.__ingweMedia(a);
  }, { capture: true });

  // 7b. Escape key — when fullscreen, asks Rust to exit fullscreen.
  //     Rust gates the action on `is_fullscreen` so calling outside fullscreen is a no-op.
  window.addEventListener('keydown', function(e) {
    if (e.isTrusted && e.key === 'Escape') {
      try { fetch('ingwe-ctrl://?a=escape').catch(function(){}); } catch(_) {}
    }
  }, false);

  // 6. Edge hover / scroll-to-top detection — triggers fullscreen titlebar/sidebar reveal
  (function() {
    var atTop  = false;
    var atLeft = false;
    function notifyTop(is) {
      if (is === atTop) return;
      atTop = is;
      try { fetch('ingwe-ctrl://?a=' + (is ? 'top-enter' : 'top-leave')).catch(function(){}); } catch(_) {}
    }
    function notifyLeft(is) {
      if (is === atLeft) return;
      atLeft = is;
      try { fetch('ingwe-ctrl://?a=' + (is ? 'left-enter' : 'left-leave')).catch(function(){}); } catch(_) {}
    }
    window.addEventListener('mousemove', function(e) {
      notifyTop(e.clientY <= 4);
      notifyLeft(e.clientX <= 4);
    }, { passive: true });
    window.addEventListener('scroll', function() {
      notifyTop(window.scrollY <= 5);
    }, { passive: true });
  })();

  // 8. Diagnostic ping — logs to Rust so we can confirm the init script loaded
  try { fetch('ingwe-ctrl://?a=script-ready').catch(function(){}); } catch(_) {}
})();
"#;

/// Freezes all JS timer and audio activity in a background webview.
pub const SUSPEND_SCRIPT: &str = r#"
(function() {
  if (window.__ingweSuspended) return;
  window.__ingweSuspended = true;

  window.__origSetInterval  = window.setInterval;
  window.__origSetTimeout   = window.setTimeout;
  window.__origRAF          = window.requestAnimationFrame;

  window.setInterval  = function() { return -1; };
  window.setTimeout   = function() { return -1; };
  window.requestAnimationFrame = function() { return -1; };

  try { if (window.__ingweAudioCtx) window.__ingweAudioCtx.suspend && window.__ingweAudioCtx.suspend(); } catch(_) {}

  document.querySelectorAll('video, audio').forEach(function(el) {
    el.__ingwePrevMuted = el.muted;
    el.muted = true;
    try { el.pause && el.pause(); } catch(_) {}
  });

  if (window.__ingweObservers) {
    window.__ingweObservers.forEach(function(o) { try { o.disconnect(); } catch(_) {} });
  }
})();
"#;

/// Restores a suspended webview to full activity.
pub const RESUME_SCRIPT: &str = r#"
(function() {
  if (!window.__ingweSuspended) return;
  window.__ingweSuspended = false;

  if (window.__origSetInterval)  window.setInterval  = window.__origSetInterval;
  if (window.__origSetTimeout)   window.setTimeout   = window.__origSetTimeout;
  if (window.__origRAF)          window.requestAnimationFrame = window.__origRAF;

  try { if (window.__ingweAudioCtx) window.__ingweAudioCtx.resume && window.__ingweAudioCtx.resume(); } catch(_) {}

  document.querySelectorAll('video, audio').forEach(function(el) {
    el.muted = el.__ingwePrevMuted != null ? el.__ingwePrevMuted : false;
  });

  if (window.__ingweObservers) {
    window.__ingweObservers.forEach(function(o) {
      try { o.observe(document.body); } catch(_) {}
    });
  }
})();
"#;
