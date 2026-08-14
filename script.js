// Only run TV-related initialization on the TV page (tv.html) or when player exists
const isTVPage = window.location.pathname.endsWith('tv.html') || !!document.querySelector('.player-wrapper');

if (isTVPage) {
    const supabaseUrl = 'https://dnelzlyuhhxloysstnlg.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWx6bHl1aGh4bG95c3N0bmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTM4MjAsImV4cCI6MjA4MTQyOTgyMH0.jYdJM1FTJja_A5CdTN3C3FWlKd_0E1JgHyaM4767SLc';
    const _supabase = (typeof supabase !== 'undefined') ? supabase.createClient(supabaseUrl, supabaseKey) : null;

    let hls, player;
    let channels = [];
    let currentChannelIndex = 0;
    let measuredSpeed = 0; // MB/s smoothed
    let touchStartX = 0;
    let wasFullscreen = false;
    // fallback channels (used when Supabase is unavailable)
    const DEFAULT_CHANNELS = [
        { id: 1, name: 'Demo News', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'm3u8', logo: 'https://via.placeholder.com/90?text=News' },
        { id: 2, name: 'Demo Music', url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', type: 'm3u8', logo: 'https://via.placeholder.com/90?text=Music' },
        { id: 3, name: 'Demo Tube', url: 'https://www.youtube.com/watch?v=ysz5S6PUM-U', type: 'youtube', logo: 'https://via.placeholder.com/90?text=YouTube' }
    ];
    // provide a no-op for inline handler used in tv.html body
    window.forceUnlimitedPop = window.forceUnlimitedPop || function(){};
    // global XHR byte counter (fallback/robust measurement)
    window.__xhr_total_bytes = 0;
    (function initXhrTracker(){
        try {
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function() {
                try {
                    this._lastLoaded = 0;
                    this.addEventListener('progress', (e) => {
                        const loaded = e.loaded || 0;
                        const delta = Math.max(0, loaded - (this._lastLoaded || 0));
                        this._lastLoaded = loaded;
                        window.__xhr_total_bytes = (window.__xhr_total_bytes || 0) + delta;
                    });
                } catch (e) {}
                return origSend.apply(this, arguments);
            };
        } catch(e) {}
    })();

    // interval to compute MB/s from XHR bytes (1s smoothing)
    (function startSpeedTicker(){
        let lastTotal = 0;
        setInterval(() => {
            const total = window.__xhr_total_bytes || 0;
            const delta = Math.max(0, total - lastTotal);
            lastTotal = total;
            const mbps = delta / (1024 * 1024);
            // combine with HLS measuredSpeed if present; smooth
            const combined = (measuredSpeed && measuredSpeed > 0) ? (measuredSpeed * 0.5 + mbps * 0.5) : mbps;
            measuredSpeed = measuredSpeed === 0 ? combined : (measuredSpeed * 0.75 + combined * 0.25);
            const el = document.getElementById('speedIndicator');
            if (el) el.innerText = measuredSpeed > 0.005 ? measuredSpeed.toFixed(2) + ' MB/s' : '— MB/s';
        }, 1000);
    })();

    // Define safe defaults in case functions aren't available yet
    window.setupKeyboard = window.setupKeyboard || function(){};
    window.setupSwipeControls = window.setupSwipeControls || function(){};
    window.setupChannelClickDelegation = window.setupChannelClickDelegation || function(){};

    document.addEventListener('DOMContentLoaded', () => {
        try { initProgressBar(); } catch(e){ console.error('initProgressBar error:', e); }
        try { initApp(); } catch(e){ console.error('initApp error:', e); }
        try { if (typeof setupKeyboard === 'function') setupKeyboard(); } catch(e){ console.error('setupKeyboard error:', e); }
        try { if (typeof setupSwipeControls === 'function') setupSwipeControls(); } catch(e){ console.error('setupSwipeControls error:', e); }
        try { if (typeof setupChannelClickDelegation === 'function') setupChannelClickDelegation(); } catch(e){ console.error('setupChannelClickDelegation error:', e); }
    });

    function setupChannelClickDelegation(){
        try{
            const list = document.getElementById('channels-list');
            if(!list) return;
            list.addEventListener('click', (e)=>{
                let card = e.target.closest('.channel-card');
                if(!card) return;
                handleChannelClick(card);
            });
            // keyboard support
            list.addEventListener('keydown', (e)=>{
                if(e.key === 'Enter' || e.key === ' '){
                    e.preventDefault();
                    let card = e.target.closest('.channel-card');
                    if(card) handleChannelClick(card);
                }
            });
        }catch(e){console.warn('channel click delegation failed', e)}
    }
    
    function handleChannelClick(card){
            try{
                const url = card.getAttribute('data-url');
                const name = card.getAttribute('data-name');
                const type = card.getAttribute('data-type') || 'm3u8';
                const idx = parseInt(card.getAttribute('data-index'), 10);
            
                if(!url || !name){
                    console.error('Invalid channel data', {url, name});
                    return;
                }
            
                try{ console.log('Channel click:', name, url, type); }catch(e){}
                window.playChannel(url, name, type, card);
            }catch(e){
                console.error('handleChannelClick failed:', e);
            }
        }

function initProgressBar() {
    const progressBar = document.querySelector('#progress-bar');
    if (!progressBar) return;

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress > 100) progress = 100;
        progressBar.style.width = progress + '%';
        if (progress >= 100) clearInterval(interval);
    }, 100);
}

async function initApp() {
    loadNotice();
    fetchChannels();
}

    async function loadNotice() {
        if (!_supabase) return;
        try {
            const { data, error } = await _supabase.from('settings').select('value').eq('key', 'main_notice').maybeSingle();
            if (error) {
                return;
            }
            if (data?.value) {
                const noticeBar = document.getElementById('notice-bar');
                if (noticeBar) {
                    noticeBar.classList.remove('hidden');
                    const noticeText = document.getElementById('notice-text');
                    if (noticeText) noticeText.innerText = data.value;
                }
            }
        } catch (e) {
            // Ignore missing tables / unavailable notice config.
        }
    }

    async function fetchChannels() {
        if (!_supabase) {
            console.warn('Supabase client not available — using DEFAULT_CHANNELS fallback');
            channels = DEFAULT_CHANNELS.slice();
        } else {
            let { data, error } = await _supabase.from('channels').select('*').order('id', { ascending: true });
            if (error) {
                console.error("Supabase Error:", error);
                // fallback to default channels when supabase request fails
                channels = DEFAULT_CHANNELS.slice();
            } else {
                channels = data || [];
            }
        }
        if (channels.length > 0) {
            displayChannels(channels);
            // animate channel list with stagger
            document.querySelectorAll('#channels-list .channel-card').forEach((el, idx) => {
                el.style.setProperty('--i', idx);
                setTimeout(() => el.classList.add('show'), 60 * idx + 50);
            });
            currentChannelIndex = 0;
            if (channels[0] && channels[0].url) {
                window.playChannel(channels[0].url, channels[0].name, channels[0].type || 'm3u8');
            } else {
                console.error('First channel has no URL', channels[0]);
            }
        } else {
                console.log("টেবিলে কোনো চ্যানেল পাওয়া যায়নি — দেখাচ্ছি নো-চ্যানেল মেসেজ");
                const container = document.getElementById('channels-list');
                if (container) container.innerHTML = '<div style="padding:20px;color:rgba(255,255,255,0.7)">কোনো চ্যানেল পাওয়া যায়নি।</div>';
        }
    }

function displayChannels(channels) {
    const container = document.getElementById('channels-list');
    if (!container) return;
    container.innerHTML = channels.map((ch, idx) => `
        <div class="channel-card" data-index="${idx}" data-name="${escapeHtml(ch.name)}" data-url="${escapeHtml(ch.url)}" data-type="${ch.type || 'm3u8'}" role="button" tabindex="0" aria-label="চ্যানেল: ${ch.name}">
            <div class="channel-thumb">
                <img loading="lazy" decoding="async" src="${ch.logo || 'https://via.placeholder.com/90'}" alt="${ch.name}">
                <div class="playing-overlay"><i class="fas fa-play"></i></div>
            </div>
            <div class="channel-info"><h4>${escapeHtml(ch.name)}</h4></div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// YouTube URL/ID থেকে ভিডিও আইডি বের করার ফাংশন (Error 153 ফিক্স করার জন্য)
// Animate a liquid-like blob from a source element to the player, then call callback
function animateFlow(fromElement, options = {}, callback) {
    try {
        try{ console.log('animateFlow start', fromElement); }catch(e){}
        const wrapper = document.querySelector('.player-wrapper');
        if (!fromElement || !wrapper) { callback && callback(); return; }
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = wrapper.getBoundingClientRect();

        const blob = document.createElement('div');
        blob.className = 'flow-blob';
        const size = Math.max(fromRect.width, fromRect.height, 40);
        blob.style.width = size + 'px';
        blob.style.height = size + 'px';
        blob.style.left = (fromRect.left + fromRect.width/2 - size/2) + 'px';
        blob.style.top = (fromRect.top + fromRect.height/2 - size/2) + 'px';
        document.body.appendChild(blob);

        const dx = (toRect.left + toRect.width/2) - (fromRect.left + fromRect.width/2);
        const dy = (toRect.top + toRect.height/2) - (fromRect.top + fromRect.height/2);

        const destScale = Math.max((toRect.width*1.2) / size, 6);
        const duration = options.duration || 700;

        // animate blob moving and growing
        const keyframes = [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            { transform: `translate(${dx*0.6}px, ${dy*0.6}px) scale(${destScale*0.55})`, opacity: 0.95, offset: 0.6 },
            { transform: `translate(${dx}px, ${dy}px) scale(${destScale})`, opacity: 0 }
        ];

        const anim = blob.animate(keyframes, { duration: duration, easing: 'cubic-bezier(.2,.9,.2,1)' });
        anim.onfinish = () => {
            try{ console.log('animateFlow finished'); }catch(e){}
            try {
                // small burst at destination
                const burst = document.createElement('div');
                burst.className = 'flow-burst';
                const bsize = Math.max(80, toRect.width*0.3);
                burst.style.width = bsize + 'px';
                burst.style.height = bsize + 'px';
                burst.style.left = (toRect.left + toRect.width/2 - bsize/2) + 'px';
                burst.style.top = (toRect.top + toRect.height/2 - bsize/2) + 'px';
                document.body.appendChild(burst);
                burst.animate([
                    { transform: 'scale(.2)', opacity: 0.8 },
                    { transform: 'scale(1.2)', opacity: 0.0 }
                ], { duration: 420, easing: 'cubic-bezier(.2,.9,.2,1)' }).onfinish = () => burst.remove();
            } catch (e) {}
            blob.remove();
            callback && callback();
        };
    } catch (e) { callback && callback(); }
}

function getYouTubeId(url) {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

    window.playChannel = function(url, name, type, element) {
        try {
            if (!url || typeof url !== 'string' || url.trim().length === 0) {
                console.error('playChannel: URL is empty');
                alert('চ্যানেলের URL উপলব্ধ নেই');
                return;
            }
            if (typeof name !== 'string' || !name.trim()) name = 'Untitled Channel';
            type = (type || 'm3u8').toString();
        } catch (e) {
            console.error('playChannel guard failed:', e);
            return;
        }

        const fromThumb = element ? element.querySelector('.channel-thumb') || element : null;

        const doPlay = function() {
            try {
                wasFullscreen = !!document.fullscreenElement;
                if (wasFullscreen && document.exitFullscreen) {
                    document.exitFullscreen();
                }

                currentChannelIndex = channels.findIndex(ch => ch && ch.url === url);
                if (currentChannelIndex < 0) currentChannelIndex = 0;

                const wrapper = document.querySelector('.player-wrapper');
                if (!wrapper) return;

                const titleEl = document.getElementById('stream-title');
                if (titleEl) titleEl.innerText = name;

                let overlay = wrapper.querySelector('.player-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'player-overlay';
                    overlay.innerHTML = '<div class="player-loader" aria-hidden="true"></div>';
                    wrapper.appendChild(overlay);
                }
                overlay.style.opacity = '1';
                overlay.style.transition = 'opacity .25s ease';

                document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
                // Prefer the clicked element, otherwise try to find a matching card by index or url so programmatic plays also update UI
                let activeCard = null;
                if (element) {
                    activeCard = element;
                } else {
                    // try by data-index first
                    try {
                        activeCard = document.querySelector(`.channel-card[data-index="${currentChannelIndex}"]`) || document.querySelector(`.channel-card[data-url="${url}"]`);
                    } catch (err) {
                        activeCard = document.querySelector(`.channel-card[data-url="${url}"]`);
                    }
                }
                if (activeCard) {
                    activeCard.classList.add('active');
                    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                if (player) {
                    if (typeof player.destroy === 'function') player.destroy();
                    player = null;
                }
                if (hls) {
                    try { hls.destroy(); } catch (e) {}
                    hls = null;
                }

                if (type === 'youtube') {
                    const videoId = getYouTubeId(url);
                    wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&enablejsapi=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:20px;"></iframe>`;
                    setTimeout(() => overlay.style.opacity = '0', 600);
                    return;
                }

                if (type === 'iframe') {
                    wrapper.innerHTML = url.includes('<iframe') ? url : `<iframe src="${url}" frameborder="0" allow="autoplay" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:20px;"></iframe>`;
                    setTimeout(() => overlay.style.opacity = '0', 600);
                    return;
                }

                wrapper.innerHTML = '<video id="player" controls playsinline preload="auto" autoplay></video>';
                const video = document.getElementById('player');
                if (!video) {
                    console.error('Player element missing after wrapper reset');
                    return;
                }

                video.muted = true;
                video.playsInline = true;

                const defaultOptions = {
                    autoplay: true,
                    muted: false,
                    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
                    settings: ['quality', 'speed'],
                };

                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    hls = new Hls({
                        enableWorker: true,
                        lowLatencyMode: true,
                        maxBufferLength: 120,
                        maxMaxBufferLength: 600,
                        liveSyncDurationCount: 3,
                        backBufferLength: 90,
                        maxBufferSize: 60 * 1024 * 1024
                    });

                    try {
                        hls.on(Hls.Events.FRAG_LOADED, function(event, data) {
                            try {
                                const stats = data.stats || {};
                                const bytes = stats.loaded || 0;
                                const trequest = stats.trequest || 0;
                                const tload = stats.tload || 0;
                                const durationMs = tload - trequest;
                                if (durationMs > 0 && bytes > 0) {
                                    const bytesPerSec = bytes / (durationMs / 1000);
                                    const mbPerSec = bytesPerSec / (1024 * 1024);
                                    measuredSpeed = measuredSpeed === 0 ? mbPerSec : (measuredSpeed * 0.7 + mbPerSec * 0.3);
                                    const el = document.getElementById('speedIndicator');
                                    if (el) el.innerText = measuredSpeed > 0 ? measuredSpeed.toFixed(2) + ' MB/s' : '— MB/s';
                                }
                            } catch (e) {}
                        });
                    } catch (e) {}

                    if (!url || typeof url !== 'string' || url.trim().length === 0) {
                        console.error('Invalid URL for HLS:', url);
                        overlay.style.opacity = '0';
                        if (titleEl) titleEl.innerText = 'URL invalid: ' + name;
                        return;
                    }

                    hls.loadSource(url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        player = new Plyr(video, defaultOptions);
                        video.play().catch(() => console.log('Autoplay blocked'));
                        try { video.muted = false; } catch (e) {}
                        if (overlay) overlay.style.opacity = '0';
                    });
                } else {
                    if (!url || typeof url !== 'string' || url.trim().length === 0) {
                        console.error('Invalid URL for fallback player:', url);
                        overlay.style.opacity = '0';
                        if (titleEl) titleEl.innerText = 'URL invalid: ' + name;
                        return;
                    }
                    video.src = url;
                    player = new Plyr(video, defaultOptions);
                    video.play().catch(() => console.log('Autoplay blocked'));
                    try { video.muted = false; } catch (e) {}
                    if (overlay) overlay.style.opacity = '0';
                }
            } catch (e) {
                console.error('playChannel doPlay error:', e);
            }
        };

        if (fromThumb) {
            try { console.log('playChannel will animate from thumb'); } catch (e) {}
            animateFlow(fromThumb, { duration: 700 }, doPlay);
        } else {
            try { console.log('playChannel direct play'); } catch (e) {}
            doPlay();
        }
    };

    document.addEventListener('keydown', (e) => {
        if (!isTVPage) return;
        const video = document.getElementById('player');
        if (!video) return;
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (video.paused) video.play(); else video.pause();
        }
        if (e.key.toLowerCase() === 'f') {
            const wrapper = document.querySelector('.player-wrapper');
            if (!document.fullscreenElement) wrapper && wrapper.requestFullscreen?.();
            else document.exitFullscreen?.();
        }
    });

    function updateTitleMarquee() {
        const title = document.getElementById('stream-title');
        if (!title) return;
        const wrap = document.createElement('div');
        wrap.className = 'stream-title-wrap';
        const span = document.createElement('div');
        span.className = 'stream-title';
        span.innerText = title.innerText;
        wrap.appendChild(span);
        title.parentNode.replaceChild(wrap, title);
        requestAnimationFrame(() => {
            if (span.scrollWidth > wrap.clientWidth) span.classList.add('marquee');
        });
    }
    updateTitleMarquee();

    function setupSwipeControls() {
        const wrapper = document.querySelector('.player-wrapper');
        if (!wrapper) return;

        wrapper.addEventListener('touchstart', e => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        wrapper.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchEndX - touchStartX;

            if (Math.abs(diff) > 60 && channels.length > 1) {
                if (diff > 0) {
                    currentChannelIndex = (currentChannelIndex - 1 + channels.length) % channels.length;
                } else {
                    currentChannelIndex = (currentChannelIndex + 1) % channels.length;
                }
                const ch = channels[currentChannelIndex];
                if (ch && ch.url) {
                    window.playChannel(ch.url, ch.name, ch.type || 'm3u8');
                }
            }
        }, { passive: true });
    }

    function setupKeyboard() {
        window.addEventListener('keydown', e => {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            if (channels.length === 0) return;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                currentChannelIndex = (currentChannelIndex + 1) % channels.length;
                const ch = channels[currentChannelIndex];
                if (ch && ch.url) {
                    window.playChannel(ch.url, ch.name, ch.type || 'm3u8');
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                currentChannelIndex = (currentChannelIndex - 1 + channels.length) % channels.length;
                const ch = channels[currentChannelIndex];
                if (ch && ch.url) {
                    window.playChannel(ch.url, ch.name, ch.type || 'm3u8');
                }
            }
        }, true);
    }

    window.filterChannels = function() {
        const input = document.getElementById('channelSearch')?.value?.toLowerCase() || '';
        document.querySelectorAll('.channel-card').forEach(card => {
            const name = card.getAttribute('data-name')?.toLowerCase() || '';
            card.style.display = name.includes(input) ? 'flex' : 'none';
        });
    };

    async function dataloop() {
        if (!_supabase) return;
        try {
            const { data: users, error: usersError } = await _supabase
                .from('user_stats')
                .select('username, total_seconds')
                .eq('username', '1');

            if (usersError || !users || users.length === 0) return;
            const currentSeconds = users[0].total_seconds;

            await _supabase
                .from('user_stats')
                .update({ total_seconds: currentSeconds + 1 })
                .eq('username', '1');
        } catch (e) {
            // Ignore missing table / 404s when Supabase tables are not configured yet.
        }
    }
    if (!window.__tvStatsLoopStarted) {
        window.__tvStatsLoopStarted = true;
        setInterval(dataloop, 1000);
    }

    async function reportIssue() {
        try {
            if (!channels[currentChannelIndex]) {
                alert('কোনো চ্যানেল নির্বাচিত নেই');
                return;
            }
            const channel = channels[currentChannelIndex];

            if (_supabase) {
                const { error } = await _supabase.from('report').insert({
                    name: channel.name,
                    timestamp: new Date().toISOString()
                });
                if (error) {
                    console.error('Report error:', error);
                    alert('চ্যানেলের রিপোর্ট পাঠাতে ব্যর্থ: ' + (error.message || 'অজানা ত্রুটি'));
                    return;
                }
            } else {
                console.log('Report (Supabase unavailable):', channel.name);
            }

            alert('চ্যানেলের রিপোর্ট পাঠানো হয়েছে: ' + channel.name + '। ধন্যবাদ!');
        } catch (e) {
            console.error('reportIssue error:', e);
            alert('রিপোর্ট পাঠাতে ত্রুটি হয়েছে: ' + e.message);
        }
    }

    window.reportIssue = reportIssue;

}

// close isTVPage block (balance braces)


/* Welcome page: subtle animations and theme toggle */
(function(){
    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero-card');
        if (hero) setTimeout(() => hero.classList.add('visible'), 120);

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isLight = document.documentElement.classList.toggle('light-theme');
                if (isLight) {
                    document.documentElement.style.setProperty('--bg', '#f6f8fb');
                    document.documentElement.style.setProperty('--card', '#ffffffcc');
                    document.documentElement.style.setProperty('--text', '#071226');
                } else {
                    document.documentElement.style.removeProperty('--bg');
                    document.documentElement.style.removeProperty('--card');
                    document.documentElement.style.removeProperty('--text');
                }
            });
        }
    });
})();