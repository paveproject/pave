import { SessionSourceGate } from '../../../screens/protestMode/components/SessionSourceGate';
import ProtestAudioListScreen from '../../../screens/protestMode/ProtestAudioListScreen';

const Route = () => (
  <SessionSourceGate>
    {({ sessionId, source }) => <ProtestAudioListScreen sessionId={sessionId} source={source} />}
  </SessionSourceGate>
);

export default Route;
