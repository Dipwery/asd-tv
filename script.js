const supabaseUrl = 'https://dnelzlyuhhxloysstnlg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWx6bHl1aGh4bG95c3N0bmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTM4MjAsImV4cCI6MjA4MTQyOTgyMH0.jYdJM1FTJja_A5CdTN3C3FWlKd_0E1JgHyaM4767SLc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let hls, player;
let channels = [];
let currentChannelIndex = 0;
let touchStartX = 0;
let wasFullscreen = false;

document.addEventListener('DOMContentLoaded', () => {
    initProgressBar();
    initApp();
    setupKeyboard();
    setupSwipeControls();
});

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
    let { data, error } = await _supabase.from('channels').select('*').order('id', { ascending: true });
    
    if (error) {
        console.error("Supabase Error:", error);
        alert("ডাটাবেজ থেকে ডাটা আনা যাচ্ছে না! কনসোল (F12) চেক করুন।");
        return;
    }

    channels = data || [];
    if (channels.length > 0) {
        displayChannels(channels);
        currentChannelIndex = 0;
        playChannel(channels[0].url, channels[0].name, channels[0].type || 'm3u8');
    } else {
        console.log("টেবিলে কোনো চ্যানেল পাওয়া যায়নি।");
    }
}

function displayChannels(channels) {
    const container = document.getElementById('channels-list');
    if (!container) return;
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

// YouTube URL/ID থেকে ভিডিও আইডি বের করার ফাংশন (Error 153 ফিক্স করার জন্য)
function getYouTubeId(url) {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

window.playChannel = function(url, name, type, element) {
    wasFullscreen = !!document.fullscreenElement;
    if (wasFullscreen && document.exitFullscreen) {
        document.exitFullscreen();
    }
    
    currentChannelIndex = channels.findIndex(ch => ch.url === url);
    
    const wrapper = document.querySelector('.player-wrapper');
    const titleEl = document.getElementById('stream-title');
    if (titleEl) titleEl.innerText = name;
    
    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    if (element) {
        element.classList.add('active');
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (player) {
        if (typeof player.destroy === 'function') player.destroy();
        player = null;
    }
    if (hls) {
        hls.destroy();
        hls = null;
    }

    // ১. ইউটিউব টাইপ হ্যান্ডেল করা
    if (type === 'youtube') {
        const videoId = getYouTubeId(url);
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&enablejsapi=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:20px;"></iframe>`;
        return;
    } 
    // ২. আইফ্রেমি টাইপ
    else if (type === 'iframe') {
        wrapper.innerHTML = url.includes('<iframe') ? url : `<iframe src="${url}" frameborder="0" allow="autoplay" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:20px;"></iframe>`;
        return;
    }

    // ৩. M3U8 / Live Stream টাইপ
    wrapper.innerHTML = '<video id="player" controls playsinline autoplay></video>';
    const video = document.getElementById('player');
    video.muted = false;

    const defaultOptions = {
        autoplay: true,
        muted: false,
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
        settings: ['quality', 'speed'],
    };

    if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            player = new Plyr(video, defaultOptions);
            video.play().catch(() => console.log("Autoplay blocked"));
        });
    } else {
        video.src = url;
        player = new Plyr(video, defaultOptions);
        video.play().catch(() => console.log("Autoplay blocked"));
    }
};

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
            playChannel(ch.url, ch.name, ch.type || 'm3u8');
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
            playChannel(ch.url, ch.name, ch.type || 'm3u8');
        } 
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            currentChannelIndex = (currentChannelIndex - 1 + channels.length) % channels.length;
            const ch = channels[currentChannelIndex];
            playChannel(ch.url, ch.name, ch.type || 'm3u8');
        }
    }, true);
}

window.filterChannels = function() {
    const input = document.getElementById('channelSearch').value.toLowerCase();
    document.querySelectorAll('.channel-card').forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        card.style.display = name.includes(input) ? 'flex' : 'none';
    });
};

// ইউজার টাইম ট্র্যাক করার লুপ
async function dataloop() {
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
}
setInterval(dataloop, 1000);

async function reportIssue() {
    if (!channels[currentChannelIndex]) return;
    const channel = channels[currentChannelIndex];
    const { error } = await _supabase.from('report').insert({
        name: channel.name,
    });
    if (!error) {
        alert('Reported issue for channel: ' + channel.name + '. Thank you for your feedback!');
    }
}