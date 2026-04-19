import { createAudioPlayer, AudioPlayer, AudioSource } from 'expo-audio';
import { useSettingsStore } from '../stores/settings.store';

type SoundName =
  | 'cell_tap'
  | 'digit_place'
  | 'error'
  | 'hint'
  | 'complete'
  | 'undo';

const SOUND_FILES: Record<SoundName, AudioSource> = {
  cell_tap: require('../../assets/sounds/cell_tap.wav'),
  digit_place: require('../../assets/sounds/digit_place.wav'),
  error: require('../../assets/sounds/error.wav'),
  hint: require('../../assets/sounds/hint.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  undo: require('../../assets/sounds/undo.wav'),
};

const soundCache = new Map<SoundName, AudioPlayer>();

async function getSound(name: SoundName): Promise<AudioPlayer | null> {
  try {
    if (soundCache.has(name)) return soundCache.get(name)!;

    const player = createAudioPlayer(SOUND_FILES[name]);

    soundCache.set(name, player);
    return player;
  } catch {
    return null;
  }
}

export function playSound(name: SoundName): void {
  const { soundEnabled } = useSettingsStore.getState();
  if (!soundEnabled) return;

  try {
    const player = createAudioPlayer(SOUND_FILES[name]);

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        subscription.remove(); // cleanup listener
        player.release();      // cleanup player
      }
    });

    player.play();
  } catch {}
}

export async function configureAudioSession(): Promise<void> {
  // expo-audio currently does NOT require explicit audio mode setup
  // (handled internally)
}

export async function unloadAllSounds(): Promise<void> {
  for (const player of soundCache.values()) {
    try {
      player.release(); // equivalent of unloadAsync
    } catch {}
  }
  soundCache.clear();
}