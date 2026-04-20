/**
 * Runtime module: loaded lazily by the gateway when the channel starts.
 * Contains the WebSocket monitor and inbound/outbound message handling.
 */

export { monitorAgentevo, getActiveSend } from "./monitor.js";
export { handleInboundNewSession, handleInboundMessage } from "./inbound.js";
export { sendAgentevoMessage } from "./outbound.js";
