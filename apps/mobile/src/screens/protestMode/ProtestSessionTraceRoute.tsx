import { SessionSourceGate } from './components/SessionSourceGate';
import ProtestTraceScreen from './ProtestTraceScreen';

const ProtestSessionTraceRoute = () => (
  <SessionSourceGate>
    {({ sessionId, source }) => <ProtestTraceScreen sessionId={sessionId} source={source} />}
  </SessionSourceGate>
);

export default ProtestSessionTraceRoute;
