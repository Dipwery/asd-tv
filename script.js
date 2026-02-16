const supabaseUrl = 'https://dnelzlyuhhxloysstnlg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWx6bHl1aGh4bG95c3N0bmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTM4MjAsImV4cCI6MjA4MTQyOTgyMH0.jYdJM1FTJja_A5CdTN3C3FWlKd_0E1JgHyaM4767SLc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let hls, player;
let channels = [];
let currentChannelIndex = 0;
let touchStartX = 0;
let wasFullscreen = false;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupKeyboard();
    setupSwipeControls();
});

async function initApp() {
    loadNotice();
    fetchChannels();
}

async function loadNotice() {
    const { data } = await _supabase.from('settings').select('value').eq('key', 'main_notice').maybeSingle();
    if (data?.value) {
        const noticeBar = document.getElementById('notice-bar');
        if (noticeBar) {
            noticeBar.classList.remove('hidden');
            document.getElementById('notice-text').innerText = data.value;
        }
    }
}

async function fetchChannels() {
    let { data } = await _supabase.from('channels').select('*').order('created_at', { ascending: true });
    channels = data || [];
    if (channels.length > 0) {
        displayChannels(channels);
        playChannel(channels[0].url, channels[0].name, channels[0].type || 'm3u8');
    }
}

function displayChannels(channels) {
    const container = document.getElementById('channels-list');
    container.innerHTML = channels.map(ch => `
        <div class="channel-card" onclick="playChannel('${ch.url}', '${ch.name}', '${ch.type || 'm3u8'}', this)" data-name="${ch.name}">
            <div class="channel-thumb">
                <img src="${ch.logo || 'https://via.placeholder.com/90'}" alt="${ch.name}">
                <div class="playing-overlay"><i class="fas fa-play"></i></div>
            </div>
            <div class="channel-info"><h4>${ch.name}</h4></div>
        </div>
    `).join('');
}

window.playChannel = function(url, name, type, element) {
    // --- প্রক্সি পরিবর্তন শুরু ---
    let finalUrl = url;
    if (url.startsWith('http://') && type !== 'youtube' && type !== 'iframe') {
        finalUrl = `https://video.gobinda-bsl.workers.dev/?url=${encodeURIComponent(url)}`;
    }
    // --- প্রক্সি পরিবর্তন শেষ ---

    wasFullscreen = !!document.fullscreenElement;
    currentChannelIndex = channels.findIndex(ch => ch.url === url);
    
    const wrapper = document.querySelector('.player-wrapper');
    document.getElementById('stream-title').innerText = name;
    
    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    if (element) {
        element.classList.add('active');
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (player) player.destroy();
    if (hls) hls.destroy();

    if (type === 'youtube') {
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${url}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen style="width:100%; height:100%; border-radius:20px;"></iframe>`;
        return;
    } 
    else if (type === 'iframe') {
        wrapper.innerHTML = url.includes('<iframe') ? url : `<iframe src="${url}" frameborder="0" allow="autoplay" allowfullscreen style="width:100%; height:100%; border-radius:20px;"></iframe>`;
        return;
    }

    wrapper.innerHTML = '<video id="player" controls playsinline autoplay></video>';
    const video = document.getElementById('player');

    if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            player = new Plyr(video, { autoplay: true });
            video.play().catch(() => console.log("Autoplay blocked"));
        });
    } else {
        video.src = finalUrl;
        player = new Plyr(video, { autoplay: true });
    }
};

// অন্যান্য ফাংশন (Swipe, Keyboard, Dataloop) আপনার অরিজিনাল কোডের মতোই থাকবে...
function setupSwipeControls() {
    const wrapper = document.querySelector('.player-wrapper');
    wrapper.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrapper.addEventListener('touchend', e => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 60 && channels.length > 1) {
            currentChannelIndex = (diff > 0) ? (currentChannelIndex - 1 + channels.length) % channels.length : (currentChannelIndex + 1) % channels.length;
            const ch = channels[currentChannelIndex];
            playChannel(ch.url, ch.name, ch.type || 'm3u8');
        }
    }, { passive: true });
}

function setupKeyboard() {
    window.addEventListener('keydown', e => {
        if (channels.length === 0) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            currentChannelIndex = (currentChannelIndex + 1) % channels.length;
            playChannel(channels[currentChannelIndex].url, channels[currentChannelIndex].name);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            currentChannelIndex = (currentChannelIndex - 1 + channels.length) % channels.length;
            playChannel(channels[currentChannelIndex].url, channels[currentChannelIndex].name);
        }
    });
}

async function dataloop() {
  const { data: users } = await _supabase.from('user_stats').select('total_seconds').eq('username', '1');
  if (users?.length > 0) {
    await _supabase.from('user_stats').update({ total_seconds: users[0].total_seconds + 1 }).eq('username', '1');
  }
}
setInterval(dataloop, 1000);

window.filterChannels = function() {
    const input = document.getElementById('channelSearch').value.toLowerCase();
    document.querySelectorAll('.channel-card').forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        card.style.display = name.includes(input) ? 'flex' : 'none';
    });
};