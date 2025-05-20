import React from 'react';
import { Wine as Engine, Disc, Settings, Zap, Thermometer, Filter, Car, PenTool as Tool, Gauge, File as Oil } from 'lucide-react';

function CategoryIcon({ name, size = 24 }) {
  const iconProps = { size };

  switch (name) {
    case 'engine':
      return <Engine {...iconProps} />;
    case 'disc':
      return <Disc {...iconProps} />;
    case 'settings':
      return <Settings {...iconProps} />;
    case 'steering':
      return <Gauge {...iconProps} />;
    case 'zap':
      return <Zap {...iconProps} />;
    case 'thermometer':
      return <Thermometer {...iconProps} />;
    case 'filter':
      return <Filter {...iconProps} />;
    case 'car':
      return <Car {...iconProps} />;
    case 'tool':
      return <Tool {...iconProps} />;
    case 'oil':
      return <Oil {...iconProps} />;
    default:
      return <Settings {...iconProps} />;
  }
}

export default CategoryIcon;