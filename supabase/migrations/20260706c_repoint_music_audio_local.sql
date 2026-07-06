-- #39 fix: the seeded demo catalog pointed audio_url at soundhelix.com, which
-- is unreachable/throttled from Vietnam — previews hung silently ("no
-- functionality"). Repoint to self-hosted preview clips under /public/music
-- (same-origin, served by Vercel's edge CDN → reachable from Vietnam).
-- Relative paths resolve against whatever origin serves the app.
-- Idempotent: matches the old soundhelix URLs.

UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-1.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-2.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-3.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-4.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-5.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-6.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-7.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-8.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-9.mp3'  WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-10.mp3' WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-11.mp3' WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-12.mp3' WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-13.mp3' WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3';
UPDATE public.music_tracks SET audio_url = '/music/soundhelix-song-14.mp3' WHERE audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3';
