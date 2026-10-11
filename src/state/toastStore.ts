import { create } from 'zustand';

export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  toast: { id: number; message: string; action?: ToastAction } | null;
}

export const useToastStore = create<ToastState>(() => ({ toast: null }));

let nextId = 1;

// One toast at a time; a newer message replaces the current one.
export function showToast(message: string, action?: ToastAction) {
  useToastStore.setState({ toast: { id: nextId++, message, action } });
}

export function dismissToast() {
  useToastStore.setState({ toast: null });
}
