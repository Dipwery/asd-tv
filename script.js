// ১. সুপাবেস কনফিগারেশন
const supabaseUrl = 'https://dnelzlyuhhxloysstnlg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZWx6bHl1aGh4bG95c3N0bmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTM4MjAsImV4cCI6MjA4MTQyOTgyMH0.jYdJM1FTJja_A5CdTN3C3FWlKd_0E1JgHyaM4767SLc';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let hls, player;

document.addEventListener('DOMContentLoaded', async () => {
    const channelListContainer = document.getElementById('channels-list');

    async function initApp() {
        loadNotice();
        fetchChannels();
    }

    async function loadNotice() {
        const { data } = await _supabase.from('settings').select('value').eq('key', 'main_notice').maybeSingle();
        if (data && data.value) {
            const noticeBar = document.getElementById('notice-bar');
            if (noticeBar) {
                noticeBar.classList.remove('hidden');
                document.getElementById('notice-text').innerText = data.value;
            }
        }
    }

    async function fetchChannels() {
        let { data: channels, error } = await _supabase.from('channels').select('*').order('created_at', { ascending: true });
        if (channels && channels.length > 0) {
            displayChannels(channels);
            playChannel(channels[0].url, channels[0].name); 
        }
    }

    function displayChannels(channels) {
        channelListContainer.innerHTML = channels.map(ch => `
            <div class="channel-card" onclick="playChannel('${ch.url}', '${ch.name}', this)" data-name="${ch.name}">
                <div class="channel-thumb">
                    <img src="${ch.logo || 'https://via.placeholder.com/80'}" alt="${ch.name}">
                    <div class="playing-overlay"><i class="fas fa-play"></i></div>
                </div>
                <div class="channel-info"><h4>${ch.name}</h4></div>
            </div>
        `).join('');
    }

    initApp();
});

// ২. প্লেয়ার ফাংশন (Next এবং Share কন্ট্রোলসহ)
window.playChannel = function(url, name, element) {
    const video = document.getElementById('player');
    document.getElementById('stream-title').innerText = name;
    
    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    if(element) {
        element.classList.add('active');
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (hls) hls.destroy();

    const plyrOptions = {
        // আপনার চাহিদামত কন্ট্রোল লিস্ট
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'fullscreen', 'share', 'next'],
        settings: ['quality', 'speed'],
        quality: {
            default: 720,
            options: [2160, 1080, 720, 480, 360],
            forced: true,
            onChange: (q) => {
                if (hls) hls.currentLevel = q === 0 ? -1 : hls.levels.findIndex(l => l.height === q);
            }
        }
    };

    const setupPlayer = () => {
        if (!player) {
            player = new Plyr(video, plyrOptions);

            // 'Next' বাটনে ক্লিক করলে পরের চ্যানেল প্লে হবে
            player.on('next', () => {
                const cards = Array.from(document.querySelectorAll('.channel-card:not([style*="display: none"])'));
                const currentIndex = cards.findIndex(c => c.classList.contains('active'));
                const next = (currentIndex + 1) % cards.length;
                if(cards[next]) cards[next].click();
            });

            // 'Share' বাটনে ক্লিক করলে শেয়ার অপশন আসবে
            player.on('share', () => {
                if (navigator.share) {
                    navigator.share({
                        title: document.getElementById('stream-title').innerText,
                        text: 'ASD TV তে লাইভ দেখুন!',
                        url: window.location.href
                    });
                } else {
                    alert("লিঙ্ক কপি করা হয়েছে: " + window.location.href);
                }
            });

            player.on('enterfullscreen', () => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            });
        }
    };

    if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setupPlayer();
            video.play().catch(() => {});
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        setupPlayer();
        video.play().catch(() => {});
    }
};

// ৩. কিবোর্ড কন্ট্রোল
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const cards = Array.from(document.querySelectorAll('.channel-card:not([style*="display: none"])'));
    const currentIndex = cards.findIndex(c => c.classList.contains('active'));

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIndex + 1) % cards.length;
        if(cards[next]) cards[next].click();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (currentIndex - 1 + cards.length) % cards.length;
        if(cards[prev]) cards[prev].click();
    }
});

// ৪. সার্চ ফিল্টার
window.filterChannels = function() {
    const input = document.getElementById('channelSearch').value.toLowerCase();
    document.querySelectorAll('.channel-card').forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        card.style.display = name.includes(input) ? 'flex' : 'none';
    });
};