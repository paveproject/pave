import { SessionSourceGate } from './components/SessionSourceGate';
import ProtestSessionDetailScreen from './ProtestSessionDetailScreen';

const ProtestSessionScreen = () => (
  <SessionSourceGate>
    {({ sessionId, source }) => (
      <ProtestSessionDetailScreen sessionId={sessionId} source={source} />
    )}
  </SessionSourceGate>
);

export default ProtestSessionScreen;
