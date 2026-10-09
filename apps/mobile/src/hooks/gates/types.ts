export interface AppGate {
  /** Stable identifier, used to avoid presenting the same gate twice in a row. */
  id: string;
  /** Whether this gate's condition currently holds and it should be shown. */
  isNeeded: boolean;
  /** Whether the gate's UI is already visible (route pushed, sheet open, etc). */
  isPresented: boolean;
  /** Imperatively show the gate. */
  present: () => void;
}
