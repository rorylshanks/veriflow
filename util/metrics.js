import log from './logging.js';
import * as client from 'prom-client';
import axios from 'axios';
import { getConfig } from "./config.js"
import express from 'express';

const app = express();

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const veriflow_config_reloads_total = new client.Counter({
    name: 'veriflow_config_reloads_total',
    help: 'Number of configuration reloads and their results (failed/success)',
    labelNames: ['result']
});

const veriflow_config_last_reload_time = new client.Gauge({
    name: 'veriflow_config_last_reload_time',
    help: 'Time of last config reload'
});

const veriflow_idp_update_duration = new client.Gauge({
    name: 'veriflow_idp_update_duration',
    help: 'Duration of the last IdP update'
});

const veriflow_idp_update_total = new client.Counter({
    name: 'veriflow_idp_update_total',
    help: 'Number of IdP updates and their result (failed/success)',
    labelNames: ['result']
});

const veriflow_idp_last_update_time = new client.Gauge({
    name: 'veriflow_idp_last_update_time',
    help: 'Time of last IdP update with its result (success, failure)',
    labelNames: ['result']
});

var registry = {
    veriflow_config_reloads_total,
    veriflow_config_last_reload_time,
    veriflow_idp_update_duration,
    veriflow_idp_update_total,
    veriflow_idp_last_update_time
}

async function getMetrics() {
    log.debug({ message: "Gathering metrics..." })
    const caddyMetricsUrl = "http://127.0.0.1:2019/metrics"
    const caddyMetricsResponse = await axios.get(caddyMetricsUrl);
    const veriflowMetrics = await client.register.metrics()
    const concatMetrics = veriflowMetrics + "\n" + caddyMetricsResponse.data
    return concatMetrics
}

async function startMetricsServer() {
    const metricsListenPort = getConfig().metrics_listen_port
    if (metricsListenPort) {
        app.get("/metrics", async (req, res) => {
            var metrics = await getMetrics()
            res.set("Content-Type", "text/plain")
            res.send(metrics)
        })

        app.listen(metricsListenPort, () => log.debug("Metrics server listening on port " + metricsListenPort));
    }
}

export default {
    getMetrics,
    registry,
    startMetricsServer

}