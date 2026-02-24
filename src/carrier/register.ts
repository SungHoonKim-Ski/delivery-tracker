import { registerCarrier } from './index.js';
import { trackCj } from './cj/api-tracker.js';
import { trackEpost } from './epost/api-tracker.js';
import { trackHanjinApi } from './hanjin/api-tracker.js';
import { trackLogenApi } from './logen/api-tracker.js';
import { trackLotte } from './lotte/api-tracker.js';

registerCarrier('LOGEN', { track: trackLogenApi });
registerCarrier('HANJIN', { track: trackHanjinApi });
registerCarrier('LOTTE', { track: trackLotte });
registerCarrier('CJ', { track: trackCj });
registerCarrier('EPOST', { track: trackEpost });
