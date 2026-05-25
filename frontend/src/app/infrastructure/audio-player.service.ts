import { Injectable } from '@angular/core';
import { LearningLanguage } from '../domain/models';

@Injectable({ providedIn: 'root' })
export class AudioPlayer {
  private currentAudio: HTMLAudioElement | null = null;

  speak(text: string, language: LearningLanguage): void {
    this.stop();
    const speech = window.speechSynthesis;
    if (!speech || typeof window.SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US';
    speech.cancel();
    speech.speak(utterance);
  }

  async playUrl(url: string): Promise<void> {
    this.stop();
    const audio = new Audio(url);
    this.currentAudio = audio;
    await audio.play();
  }

  stop(): void {
    window.speechSynthesis?.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }
}
