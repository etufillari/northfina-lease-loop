// Registers every slice's event handlers once (docs/log/wave0-events.md: registration is
// import-time). A service that emits imports this module, so no handler is silently missing.
// One line per slice.
import './invoice-handlers';
import './catalogue-handlers';
import { registerPassportHandlers } from './passport-handlers';

registerPassportHandlers();
