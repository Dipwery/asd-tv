const supabaseUrl = 'https://dnelzlyuhhxloysstnlg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWx6bHl1aGh4bG95c3N0bmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTM4MjAsImV4cCI6MjA4MTQyOTgyMH0.jYdJM1FTJja_A5CdTN3C3FWlKd_0E1JgHyaM4767SLc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let hls, player;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupKeyboard(); 
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
    let { data: channels } = await _supabase.from('channels').select('*').order('created_at', { ascending: true });
    if (channels?.length > 0) {
        displayChannels(channels);
        // ডিফল্ট প্রথম চ্যানেল অটো-প্লে করার চেষ্টা
        playChannel(channels[0].url, channels[0].name, channels[0].type || 'm3u8'); 
    }
}

function displayChannels(channels) {
    const container = document.getElementById('channels-list');
    container.innerHTML = channels.map(ch => `
        <div class="channel-card" onclick="playChannel('${ch.url}', '${ch.name}', '${ch.type || 'm3u8'}', this)" data-name="${ch.name}">
            <div class="channel-thumb">
                <img src="${ch.logo || 'https://via.placeholder.com/80'}" alt="${ch.name}">
                <div class="playing-overlay"><i class="fas fa-play"></i></div>
            </div>
            <div class="channel-info"><h4>${ch.name}</h4></div>
        </div>
    `).join('');
}

window.playChannel = function(url, name, type, element) {
    const wrapper = document.querySelector('.player-wrapper');
    document.getElementById('stream-title').innerText = name;
    
    // চ্যানেল কার্ড হাইলাইট করা
    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    if (element) {
        element.classList.add('active');
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // আগের প্লেয়ার মুছে ফেলা
    if (player) player.destroy();
    if (hls) hls.destroy();

    // ভিডিও এলিমেন্ট তৈরি (অটো-প্লের জন্য muted এবং playsinline জরুরি)
    wrapper.innerHTML = '<video id="player" controls playsinline  autoplay></video>';
    const video = document.getElementById('player');
    enableMobileFullscreen(video);


    if (type === 'youtube') {
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${url}?autoplay=1&mute=1" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:12px;"></iframe>`;
    } 
    else if (type === 'iframe') {
        wrapper.innerHTML = url.includes('<iframe') ? url : `<iframe src="${url}" frameborder="0" allow="autoplay" allowfullscreen style="width:100%; height:100%; aspect-ratio:16/9; border-radius:12px;"></iframe>`;
    } 
    else {
        // HLS এবং রেজুলেশন সেটিংস
        const defaultOptions = {
            autoplay: true,
            muted: true,
            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
            settings: ['quality', 'speed'],
        };

        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // রেজুলেশন লেভেলগুলো খুঁজে বের করা
                const availableQualities = hls.levels.map((l) => l.height);
                availableQualities.unshift(0); // 'Auto' অপশন যোগ করা

                defaultOptions.quality = {
                    default: 0,
                    options: availableQualities,
                    forced: true,
                    onChange: (q) => {
                        if (q === 0) hls.currentLevel = -1;
                        else {
                            hls.levels.forEach((level, index) => {
                                if (level.height === q) hls.currentLevel = index;
                            });
                        }
                    }
                };
                player = new Plyr(video, defaultOptions);
                video.play().catch(() => console.log("Autoplay blocked by browser"));
            });
        } else {
            video.src = url;
            player = new Plyr(video, defaultOptions);
            video.play().catch(() => {});
        }
    }
};

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;

        const cards = Array.from(document.querySelectorAll('.channel-card'));
        if (cards.length === 0) return;

        let currentIndex = cards.findIndex(c => c.classList.contains('active'));

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            let nextIndex = (currentIndex + 1) % cards.length;
            cards[nextIndex].click();
        } 
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            let prevIndex = (currentIndex - 1 + cards.length) % cards.length;
            cards[prevIndex].click();
        }
    });
}

window.filterChannels = function() {
    const input = document.getElementById('channelSearch').value.toLowerCase();
    document.querySelectorAll('.channel-card').forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        card.style.display = name.includes(input) ? 'flex' : 'none';
    });
};
/* ===============================
   MOBILE ROTATE FULLSCREEN
================================ */

function enableMobileFullscreen(video) {
    if (!video) return;

    video.addEventListener('click', () => {
        if (window.innerWidth <= 768 && !document.fullscreenElement) {
            video.requestFullscreen?.();
        }
    });
}

window.addEventListener("orientationchange", () => {
    const video = document.getElementById("player");
    if (!video) return;

    if (Math.abs(window.orientation) === 90 && !document.fullscreenElement) {
        video.requestFullscreen?.();
    }
});

/* ===============================
   MOBILE ROTATE FULLSCREEN (UPDATED)
================================ */

function enableMobileFullscreen(video) {
    if (!video) return;

    video.addEventListener('click', async () => {
        if (window.innerWidth <= 768 && !document.fullscreenElement) {
            try {
                // ফুলস্ক্রিন রিকোয়েস্ট
                if (video.requestFullscreen) {
                    await video.requestFullscreen();
                } else if (video.webkitRequestFullscreen) {
                    await video.webkitRequestFullscreen();
                }

                // স্ক্রিন রোটেট করা (Landscape মোডে লক করা)
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('landscape').catch(err => {
                        console.log("Orientation lock failed:", err);
                    });
                }
            } catch (err) {
                console.log("Fullscreen failed:", err);
            }
        }
    });
}

// ফুলস্ক্রিন থেকে বের হয়ে গেলে আবার স্ক্রিন আনলক করা
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
});