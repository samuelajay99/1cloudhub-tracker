'use client';

import CompassGate from '../../components/compass/CompassGate';
import CompassHome from '../../components/compass/CompassHome';

export default function CompassPage() {
  return <CompassGate>{({ userId }) => <CompassHome userId={userId} />}</CompassGate>;
}
