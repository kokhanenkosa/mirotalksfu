'use strict';

/**
 * AdaptiveQualityController — OPTRF Academy
 *
 * Separates LAYOUT PRIORITY from ACTUAL QUALITY (spatial/temporal/pause).
 * Uses WebRTC stats (when available), rendered tile size, bandwidth budget,
 * hysteresis, and serialized apply cycles.
 *
 * priority !== forced highest layer
 */

(function (global) {
    const PRESETS = ['max', 'high', 'balanced', 'saver', 'perf'];

    const PRIORITY_RANK = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
    };

    const DEFAULT_CONFIG = {
        statsIntervalMs: 1000,
        applyDebounceMs: 350,
        layerCooldownMs: 5000,
        emergencyCooldownMs: 1500,
        upgradeStableMs: 10000,
        badSamplesToDowngrade: 2,
        goodSamplesToRecover: 8,
        budgetSafetyFactor: 0.8,
        ewmaAlpha: 0.35,
        // Network health thresholds
        lossGood: 0.02,
        lossWarn: 0.05,
        rttGoodMs: 180,
        rttWarnMs: 350,
        // Bitrate estimates per spatial layer (webcam, bps) — for budget only (3×)
        layerBitrateEstimate: {
            0: 540000,
            1: 1500000,
            2: 4200000,
        },
        screenLayerBitrateEstimate: {
            0: 1800000,
            1: 3600000,
            2: 6600000,
        },
        // Producer ceilings — 3×; used ONLY on real sender congestion / manual preset
        producerCeilings: {
            NORMAL: { high: 6000000, mid: 1800000, low: 540000 },
            CONSTRAINED: { high: 4200000, mid: 1350000, low: 450000 },
            SEVERE: { high: 2700000, mid: 900000, low: 360000 },
        },
        producerStateCooldownMs: 10000,
        // Protected lecturer: require persistent sender limitation before any setParameters
        protectedBandwidthSamples: 4,
        protectedCpuSamplesBeforeProducer: 6,
        // Rendered-size → desired spatial tip (consumers only; never local producer)
        tilePxLow: 220,
        tilePxMid: 480,
        tilePxHigh: 720,
        // Dialog guest tile: default mid unless large
        dialogGuestPreferMidBelowPx: 700,
        debugIntervalMs: 2000,
    };

    const PRESET_CEILING = {
        // Manual profiles only (no auto). max = full layers, no early downgrade.
        max: { spatialTip: 2, temporalTip: 2, secondaryPause: false, earlyDowngrade: false },
        high: { spatialTip: 2, temporalTip: 2, secondaryPause: false, earlyDowngrade: false },
        balanced: { spatialTip: 2, temporalTip: 2, secondaryPause: false, earlyDowngrade: true },
        saver: { spatialTip: 1, temporalTip: 2, secondaryPause: false, earlyDowngrade: true },
        perf: { spatialTip: 1, temporalTip: 1, secondaryPause: true, earlyDowngrade: true },
    };

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function ewma(prev, next, alpha) {
        if (prev == null || Number.isNaN(prev)) return next;
        if (next == null || Number.isNaN(next)) return prev;
        return prev * (1 - alpha) + next * alpha;
    }

    function now() {
        return Date.now();
    }

    class AdaptiveQualityController {
        /**
         * @param {object} host RoomClient-like host
         * @param {object} [userConfig]
         */
        constructor(host, userConfig = {}) {
            this.host = host;
            this.cfg = { ...DEFAULT_CONFIG, ...userConfig };

            this._generation = 0;
            this._applyRunning = false;
            this._applyPending = false;
            this._applyTimer = null;
            this._statsTimer = null;
            this._debugTimer = null;
            this._started = false;

            this._layerCache = new Map(); // consumerId -> "s:t:p"
            this._pauseCache = new Map();
            this._consumerState = new Map(); // per-consumer adaptation state
            this._statsPrev = new Map(); // consumerId / 'recv' / 'send' -> raw snapshot
            this._metrics = {
                packetLoss: null,
                rttMs: null,
                recvBitrate: null,
                sendBitrate: null,
                availableIncoming: null,
                availableOutgoing: null,
                freezeDelta: 0,
                framesDroppedRatio: null,
                networkHealth: 'GOOD',
                uplinkState: 'NORMAL',
                decodePressure: false,
                encoderCpuPressure: false,
                qualityLimitationReason: 'none',
                outboundFps: null,
                outboundWh: null,
            };
            this._healthSamples = { bad: 0, good: 0, warning: 0 };
            this._lastLayerChangeAt = 0;
            this._lastProducerState = null;
            this._lastProducerChangeAt = 0;
            this._lastReasons = [];
            this._warmupUntil = 0;
            this._preset = 'max';
            this._pendingApplyReason = 'init';
            this._bandwidthLimitSamples = 0;
            this._cpuLimitSamples = 0;
            this._guestReliefApplied = false;
            this._producerBaseline = null;
            this._lastDialogActive = false;
            this._manualForceHighLayers = true; // default: prefer max incoming layers
            this._manualWebcamHighMbps = null;
            this._manualScreenHighMbps = null;
        }

        // ####################################################
        // Lifecycle
        // ####################################################

        start() {
            if (this._started) return;
            this._started = true;
            this._warmupUntil = now() + 2500;
            this._syncDebugFlag();
            this._statsTimer = setInterval(() => {
                this._collectStatsTick().catch(() => {});
            }, this.cfg.statsIntervalMs);
            this.schedule(200);
            this._maybeStartDebug();
        }

        stop() {
            this._started = false;
            clearTimeout(this._applyTimer);
            clearInterval(this._statsTimer);
            clearInterval(this._debugTimer);
            this._statsTimer = null;
            this._debugTimer = null;
            this._applyTimer = null;
        }

        /** Full reset after reconnect / leave. */
        reset() {
            this._generation += 1;
            this._layerCache.clear();
            this._pauseCache.clear();
            this._consumerState.clear();
            this._statsPrev.clear();
            this._healthSamples = { bad: 0, good: 0, warning: 0 };
            this._lastReasons = [];
            this._lastProducerState = null;
            this._producerBaseline = null;
            this._bandwidthLimitSamples = 0;
            this._cpuLimitSamples = 0;
            this._guestReliefApplied = false;
            this._metrics.networkHealth = 'GOOD';
            this._metrics.uplinkState = 'NORMAL';
            this._metrics.decodePressure = false;
            this._metrics.encoderCpuPressure = false;
            this._warmupUntil = now() + 2500;
            if (this.host) {
                this.host._consumerLayerCache = this._layerCache;
                this.host._consumerPauseCache = this._pauseCache;
            }
        }

        onConsumerRemoved(consumerId) {
            this._layerCache.delete(consumerId);
            this._pauseCache.delete(consumerId);
            this._consumerState.delete(consumerId);
            this._statsPrev.delete(consumerId);
        }

        setPreset(preset) {
            const p = PRESETS.includes(preset) ? preset : 'max';
            this._preset = p;
            this._layerCache.clear();
            this.schedule(50, 'manual_preset');
            return p;
        }

        /**
         * Hot session controls (creator/moderator).
         * @param {{ forceHighLayers?: boolean, webcamHighMbps?: number, screenHighMbps?: number }} opts
         */
        setManualSessionControls(opts = {}) {
            if (typeof opts.forceHighLayers === 'boolean') {
                this._manualForceHighLayers = opts.forceHighLayers;
            }
            if (opts.webcamHighMbps != null && Number(opts.webcamHighMbps) > 0) {
                this._manualWebcamHighMbps = Number(opts.webcamHighMbps);
            }
            if (opts.screenHighMbps != null && Number(opts.screenHighMbps) > 0) {
                this._manualScreenHighMbps = Number(opts.screenHighMbps);
            }
            this._layerCache.clear();
            this.schedule(50, 'manual_preset');
        }

        getManualSessionControls() {
            return {
                forceHighLayers: !!this._manualForceHighLayers,
                webcamHighMbps: this._manualWebcamHighMbps,
                screenHighMbps: this._manualScreenHighMbps,
                preset: this._preset,
            };
        }

        getPreset() {
            return this._preset;
        }

        schedule(delayMs = this.cfg.applyDebounceMs, reason = 'layout') {
            if (this._isDisabled()) return;
            if (!this._started && this.host?.socket) this.start();
            // Layout events never escalate to producer changes for protected lecturer
            this._pendingApplyReason = reason || 'layout';
            clearTimeout(this._applyTimer);
            this._applyTimer = setTimeout(() => {
                this.apply(this._pendingApplyReason).catch((err) => {
                    if (this._isDebug()) console.warn('[AQ] apply', err);
                });
            }, Math.max(0, delayMs | 0));
        }

        /** Dialog open/close — consumer adapt only; snapshot lecturer producer. */
        notifyDialogChange(active) {
            const was = this._lastDialogActive;
            this._lastDialogActive = !!active;
            if (this._isDebug()) {
                this._snapshotLecturer('DIALOG_BEFORE');
            }
            this.schedule(100, 'dialog_layout');
            if (active && !was) {
                setTimeout(() => this._snapshotLecturer('DIALOG_AFTER_1S'), 1000);
                setTimeout(() => this._snapshotLecturer('DIALOG_AFTER_5S'), 5000);
            }
        }

        // ####################################################
        // Apply cycle (serialized + generation)
        // ####################################################

        async apply(reason = 'layout') {
            if (this._isDisabled()) return;
            if (this._applyRunning) {
                this._applyPending = true;
                this._pendingApplyReason = reason;
                return;
            }
            const host = this.host;
            if (!host?.socket || !host.consumers?.size) {
                // No consumers yet — still do not touch protected producer on layout
                if (reason === 'sender_telemetry' || reason === 'manual_preset') {
                    await this._adaptProducerCeilings({ reason });
                }
                return;
            }

            this._applyRunning = true;
            const gen = ++this._generation;
            try {
                await this._applyCycle(gen, reason);
            } catch (err) {
                if (this._isDebug()) console.warn('[AQ] cycle error — fallback layout', err);
                try {
                    await this._fallbackLayoutOnly(gen);
                } catch {
                    /* ignore */
                }
            } finally {
                this._applyRunning = false;
                if (this._applyPending) {
                    this._applyPending = false;
                    this.schedule(400, this._pendingApplyReason || 'layout');
                }
            }
        }

        async _applyCycle(gen, reason = 'layout') {
            const host = this.host;
            const preset = this._resolvePreset();
            const ceiling = PRESET_CEILING[preset] || PRESET_CEILING.high;
            const metrics = this._metrics;
            const health = metrics.networkHealth || 'GOOD';
            const inWarmup = now() < this._warmupUntil;
            const encoderCpu = !!metrics.encoderCpuPressure;

            /** @type {Array<object>} */
            const items = [];

            for (const [consumerId, consumer] of host.consumers.entries()) {
                if (consumer.kind !== 'video') continue;
                const layout = this._classifyLayout(consumerId, consumer);
                items.push({ consumerId, consumer, layout });
            }

            // Desired layers from layout + tile size + preset ceiling
            for (const item of items) {
                const { layout } = item;
                if (layout.pause) {
                    item.desired = { spatialLayer: 0, temporalLayer: 0, pause: true, reason: layout.reason };
                    continue;
                }
                const max = this._getMaxLayers(item.consumer);
                let tipS = this._desiredSpatialFromTile(layout, max);
                if (this._manualForceHighLayers && !layout.pause) {
                    // Manual session: prefer max layers for visible streams
                    tipS = max.spatialLayer;
                }
                tipS = Math.min(tipS, ceiling.spatialTip, max.spatialLayer);
                let tipT = Math.min(
                    this._manualForceHighLayers ? max.temporalLayer : ceiling.temporalTip,
                    max.temporalLayer
                );

                // Dialog guest: only mid-cap when NOT in force-high manual mode
                if (!this._manualForceHighLayers && layout.isDialogGuest && !layout.isPinned) {
                    if (layout.tileCssPx < this.cfg.dialogGuestPreferMidBelowPx) {
                        tipS = Math.min(tipS, Math.min(1, max.spatialLayer));
                        tipT = Math.min(tipT, Math.min(1, max.temporalLayer));
                        item._dialogGuestCapped = true;
                    }
                }

                // Encoder CPU on local lecturer: cut guest temporal/spatial first
                if (encoderCpu && (layout.isDialogGuest || layout.priority === 'medium' || layout.priority === 'low')) {
                    tipT = Math.min(tipT, 0);
                    tipS = Math.min(tipS, Math.min(1, max.spatialLayer));
                    item._cpuRelief = true;
                }

                if (inWarmup && layout.priority !== 'critical') {
                    tipS = Math.min(tipS, Math.min(1, max.spatialLayer));
                }

                item.max = max;
                item.desiredTip = { spatialLayer: tipS, temporalLayer: tipT };
                item.desired = {
                    spatialLayer: tipS,
                    temporalLayer: tipT,
                    pause: false,
                    reason: item._cpuRelief
                        ? 'encoder_cpu_relieve_guest'
                        : item._dialogGuestCapped
                          ? 'dialog_guest_tile_mid'
                          : layout.reason,
                };
            }

            // Network / decode pressure → global quality step down (critical/high protected longer)
            const qualityCap = this._qualityCapFromHealth(health, metrics, ceiling);
            for (const item of items) {
                if (item.desired.pause) continue;
                const maxS = item.max.spatialLayer;
                const maxT = item.max.temporalLayer;
                let sCap = qualityCap.spatial;
                let tCap = qualityCap.temporal;
                const pri = item.layout.priority;

                if (pri === 'critical') {
                    if (health === 'BAD') sCap = Math.min(1, maxS);
                    else if (health === 'WARNING' || health === 'RECOVERING') sCap = Math.min(Math.max(sCap, 1), maxS);
                    else sCap = maxS;
                    if (health === 'BAD') tCap = Math.min(1, maxT);
                } else if (pri === 'high') {
                    if (health === 'BAD') sCap = Math.min(1, maxS);
                    else if (health === 'WARNING' || health === 'RECOVERING') sCap = Math.min(1, maxS);
                }

                item.desired.spatialLayer = Math.min(item.desired.spatialLayer, sCap, maxS);
                item.desired.temporalLayer = Math.min(item.desired.temporalLayer, tCap, maxT);
                if (qualityCap.reason && (health === 'BAD' || health === 'WARNING' || metrics.decodePressure)) {
                    item.desired.reason = qualityCap.reason;
                }
            }

            // Bandwidth budget allocation (may lower/pause secondary)
            this._applyBandwidthBudget(items, ceiling, health);

            // Per-consumer hysteresis + one-step upgrades
            const decisions = [];
            for (const item of items) {
                const decided = this._applyHysteresis(item, health);
                decisions.push(decided);
            }

            if (gen !== this._generation) return;

            this._lastReasons = decisions
                .filter((d) => d.changed)
                .map((d) => ({
                    id: d.consumerId,
                    priority: d.priority,
                    from: d.from,
                    to: d.to,
                    reason: d.reason,
                }));

            await Promise.allSettled(
                decisions.map((d) => this._setPaused(d.consumerId, d.pause, d.consumer))
            );

            if (gen !== this._generation) return;

            const layerJobs = [];
            for (const d of decisions) {
                if (d.pause) continue;
                if (!['simulcast', 'svc'].includes(d.consumer?.type)) continue;
                const key = `${d.spatialLayer}:${d.temporalLayer}:p0`;
                if (this._layerCache.get(d.consumerId) === key) continue;
                this._layerCache.set(d.consumerId, key);
                layerJobs.push(
                    host.socket
                        .request('setConsumerPreferredLayers', {
                            consumer_id: d.consumerId,
                            spatialLayer: d.spatialLayer,
                            temporalLayer: d.temporalLayer,
                        })
                        .catch((err) => {
                            this._layerCache.delete(d.consumerId);
                            if (this._isDebug()) console.warn('[AQ] setLayers', d.consumerId, err?.error || err);
                        })
                );
            }
            if (layerJobs.length) {
                await Promise.allSettled(layerJobs);
                this._lastLayerChangeAt = now();
                if (encoderCpu) this._guestReliefApplied = true;
            }

            if (gen !== this._generation) return;

            // UPLINK: never touch protected lecturer producer on layout/dialog reasons
            await this._adaptProducerCeilings({ reason });
            try {
                host.ensureLocalCamPlaying?.();
                host.ensureCamBubblesPlaying?.();
            } catch {
                /* ignore */
            }
        }

        async _fallbackLayoutOnly(gen) {
            const host = this.host;
            for (const [consumerId, consumer] of host.consumers.entries()) {
                if (gen !== this._generation) return;
                if (consumer.kind !== 'video') continue;
                const layout = this._classifyLayout(consumerId, consumer);
                await this._setPaused(consumerId, layout.pause, consumer);
                if (layout.pause) continue;
                if (!['simulcast', 'svc'].includes(consumer.type)) continue;
                const max = this._getMaxLayers(consumer);
                // Conservative: mid for most, high only critical/high priority large tiles
                let s = Math.min(1, max.spatialLayer);
                if (layout.priority === 'critical' || (layout.priority === 'high' && layout.tileCssPx >= this.cfg.tilePxHigh)) {
                    s = max.spatialLayer;
                }
                if (layout.priority === 'low') s = 0;
                const t = Math.min(2, max.temporalLayer);
                const key = `${s}:${t}:p0`;
                if (this._layerCache.get(consumerId) === key) continue;
                this._layerCache.set(consumerId, key);
                try {
                    await host.socket.request('setConsumerPreferredLayers', {
                        consumer_id: consumerId,
                        spatialLayer: s,
                        temporalLayer: t,
                    });
                } catch {
                    this._layerCache.delete(consumerId);
                }
            }
        }

        // ####################################################
        // Layout classification (PRIORITY only)
        // ####################################################

        _classifyLayout(consumerId, consumer) {
            const host = this.host;
            const tile = host.getId?.(consumerId + '__video');
            const mediaKind = tile?.dataset?.mediaKind || consumer?.appData?.mediaType || '';
            const peerId = tile?.dataset?.peerId || '';
            const isScreen = mediaKind === 'screen';
            const bubbleEl = peerId
                ? document.querySelector(
                      `.cam-bubble[data-cam-peer-id="${CSS.escape?.(peerId) || peerId}"]`
                  )
                : null;
            const isBubbleSource =
                !!tile?.classList?.contains('cam-bubble-source-hidden') ||
                !!bubbleEl ||
                (peerId &&
                    host._stageScene?.mode === 1 &&
                    peerId === host._stageScene?.creatorId);
            const isPinned = Boolean(
                tile?.classList?.contains('is-pinned-video') ||
                    tile?.parentElement?.id === 'videoPinMediaContainer' ||
                    (host.pinnedVideoPlayerId && consumerId === host.pinnedVideoPlayerId)
            );
            const hidden =
                !tile ||
                tile.dataset?.stageHidden === '1' ||
                tile.dataset?.dialogHidden === '1' ||
                tile.style?.display === 'none' ||
                (tile.style?.visibility === 'hidden' && !isBubbleSource);

            const isDialogPresenter =
                host._dialogSplitActive && peerId && peerId === host._dialogPresenterId;
            const isDialogGuest =
                host._dialogSplitActive &&
                peerId &&
                Array.isArray(host._dialogGuestIds) &&
                host._dialogGuestIds.includes(peerId);
            const isCreator =
                peerId &&
                (peerId === host._meetingCreatorId || peerId === host._stageScene?.creatorId);

            const tileCssPx = this._measureTileCssPx(tile, isBubbleSource);
            let priority = 'medium';
            let reason = 'visible_cam';
            let pause = false;

            // Cam-bubble source must never be paused (shared MediaStreamTrack feeds the circle)
            if (isBubbleSource) {
                priority = 'high';
                reason = 'cam_bubble';
                pause = false;
            } else if (hidden && !isScreen && !isPinned) {
                pause = true;
                priority = 'low';
                reason =
                    tile?.dataset?.dialogHidden === '1'
                        ? 'hidden_dialog'
                        : tile?.dataset?.stageHidden === '1'
                          ? 'hidden_stage'
                          : 'hidden';
            } else if (isScreen) {
                priority = 'critical';
                reason = isPinned ? 'screen_pinned' : 'screen';
            } else if (isPinned) {
                priority = 'critical';
                reason = 'pinned';
            } else if (isCreator || isDialogPresenter) {
                priority = 'high';
                reason = isCreator ? 'creator' : 'dialog_presenter';
            } else if (isDialogGuest) {
                priority = 'medium';
                reason = 'dialog_guest';
            } else {
                priority = tileCssPx < this.cfg.tilePxLow ? 'low' : 'medium';
                reason = 'visible_cam';
            }

            return {
                peerId,
                mediaKind: isScreen ? 'screen' : 'webcam',
                isScreen,
                isBubbleSource,
                isPinned,
                isCreator,
                isDialogPresenter,
                isDialogGuest,
                hidden,
                pause,
                priority,
                reason,
                tileCssPx,
            };
        }

        _measureTileCssPx(tile, isBubbleSource) {
            try {
                if (isBubbleSource) {
                    const bubble = document.querySelector(
                        `#videoPinMediaContainer .cam-bubble video, .cam-bubble video`
                    );
                    if (bubble) {
                        const r = bubble.getBoundingClientRect();
                        return Math.max(r.width || 0, r.height || 0);
                    }
                    return 160;
                }
                if (!tile) return 320;
                const video = tile.querySelector?.('video') || tile;
                const r = video.getBoundingClientRect?.() || tile.getBoundingClientRect?.();
                if (!r) return 320;
                return Math.max(r.width || 0, r.height || 0);
            } catch {
                return 320;
            }
        }

        _desiredSpatialFromTile(layout, max) {
            const maxS = max.spatialLayer | 0;
            if (layout.priority === 'critical') return maxS;
            const px = layout.tileCssPx || 320;
            if (px >= this.cfg.tilePxHigh) return maxS;
            if (px >= this.cfg.tilePxMid) return Math.min(1, maxS);
            return 0;
        }

        // ####################################################
        // Network health + budget
        // ####################################################

        _qualityCapFromHealth(health, metrics, ceiling) {
            // Cap is an upper bound on spatial/temporal tip for ALL streams
            let spatial = 2;
            let temporal = 2;
            let reason = null;

            if (metrics.decodePressure) {
                spatial = 1;
                temporal = 1;
                reason = 'decode_pressure';
            }

            if (health === 'WARNING') {
                spatial = Math.min(spatial, ceiling.earlyDowngrade ? 1 : 1);
                temporal = Math.min(temporal, 2);
                reason = reason || 'network_warning';
            }
            if (health === 'BAD') {
                spatial = 0;
                temporal = Math.min(temporal, 1);
                reason = 'network_bad';
            }
            if (health === 'RECOVERING') {
                spatial = Math.min(spatial, 1);
                reason = reason || 'network_recovering';
            }

            return { spatial, temporal, reason };
        }

        _applyBandwidthBudget(items, ceiling, health) {
            const estimates = this._metrics;
            let budget = estimates.availableIncoming;
            if (budget == null || budget <= 0) {
                // Fallback: current aggregate receive * headroom, or heuristic
                const recv = estimates.recvBitrate;
                if (recv && recv > 50000) {
                    budget = recv * 1.25;
                } else {
                    // Heuristic by health
                    budget =
                        health === 'BAD'
                            ? 800000
                            : health === 'WARNING' || health === 'RECOVERING'
                              ? 1800000
                              : 4500000;
                }
            }
            const usable = budget * this.cfg.budgetSafetyFactor;

            // Sort by priority desc, then tile size desc
            const active = items.filter((i) => !i.desired?.pause);
            active.sort((a, b) => {
                const pr = (PRIORITY_RANK[b.layout.priority] || 0) - (PRIORITY_RANK[a.layout.priority] || 0);
                if (pr) return pr;
                return (b.layout.tileCssPx || 0) - (a.layout.tileCssPx || 0);
            });

            let used = 0;
            for (const item of active) {
                const isScreen = item.layout.isScreen;
                const table = isScreen ? this.cfg.screenLayerBitrateEstimate : this.cfg.layerBitrateEstimate;
                let s = item.desired.spatialLayer;
                let cost = table[s] ?? table[2] ?? 1000000;

                while (s > 0 && used + cost > usable) {
                    s -= 1;
                    cost = table[s] ?? 150000;
                    item.desired.spatialLayer = s;
                    item.desired.reason = 'bandwidth_budget';
                }

                // Severe: pause lowest priority if still over and perf/secondaryPause
                if (
                    used + cost > usable &&
                    s === 0 &&
                    (ceiling.secondaryPause || health === 'BAD') &&
                    PRIORITY_RANK[item.layout.priority] <= PRIORITY_RANK.low
                ) {
                    item.desired.pause = true;
                    item.desired.reason = 'bandwidth_budget_pause';
                    continue;
                }

                // Congestion order: never pause critical/high unless extreme BAD + still over after all lows paused
                if (
                    used + cost > usable &&
                    s === 0 &&
                    health === 'BAD' &&
                    PRIORITY_RANK[item.layout.priority] <= PRIORITY_RANK.medium &&
                    !item.layout.isScreen
                ) {
                    item.desired.pause = true;
                    item.desired.reason = 'bandwidth_budget_pause';
                    continue;
                }

                used += cost;
            }

            // If still over budget after mediums: allow creator high->mid only (already via spatial tip)
            // Screen last: only reduce temporal first if still over
            if (used > usable && health === 'BAD') {
                for (const item of active) {
                    if (!item.layout.isScreen || item.desired.pause) continue;
                    if (item.desired.temporalLayer > 0) {
                        item.desired.temporalLayer = 0;
                        item.desired.reason = 'screen_congestion_fps';
                    }
                }
            }
        }

        _applyHysteresis(item, health) {
            const id = item.consumerId;
            const st = this._consumerState.get(id) || {
                spatialLayer: null,
                temporalLayer: null,
                pause: null,
                lastChangeAt: 0,
                stableGoodSince: null,
            };

            let targetPause = !!item.desired.pause;
            let targetS = item.desired.spatialLayer | 0;
            let targetT = item.desired.temporalLayer | 0;
            let reason = item.desired.reason || item.layout.reason;

            // Startup: prefer mid if never set
            if (st.spatialLayer == null && !targetPause) {
                const maxS = item.max?.spatialLayer ?? 2;
                if (item.layout.priority === 'critical') {
                    targetS = maxS;
                } else {
                    targetS = Math.min(targetS, Math.min(1, maxS));
                    reason = 'startup_mid';
                }
            }

            const from = {
                s: st.spatialLayer,
                t: st.temporalLayer,
                p: st.pause,
            };

            // Hidden → pause immediately (no cooldown)
            if (targetPause && item.layout.hidden) {
                const changed = st.pause !== true;
                st.pause = true;
                st.spatialLayer = 0;
                st.temporalLayer = 0;
                st.lastChangeAt = now();
                this._consumerState.set(id, st);
                return {
                    consumerId: id,
                    consumer: item.consumer,
                    priority: item.layout.priority,
                    pause: true,
                    spatialLayer: 0,
                    temporalLayer: 0,
                    changed,
                    reason,
                    from,
                    to: { s: 0, t: 0, p: true },
                };
            }

            // Emergency downgrade / freeze: fast
            const emergency =
                health === 'BAD' ||
                this._metrics.freezeDelta > 0 ||
                (this._consumerState.get(id)?._stall && true);

            const elapsed = now() - (st.lastChangeAt || 0);
            const cooldown = emergency ? this.cfg.emergencyCooldownMs : this.cfg.layerCooldownMs;

            let nextS = st.spatialLayer != null ? st.spatialLayer : targetS;
            let nextT = st.temporalLayer != null ? st.temporalLayer : targetT;
            let nextP = st.pause != null ? st.pause : targetPause;

            // Pause secondary under perf/severe
            if (targetPause && !nextP) {
                if (emergency || PRIORITY_RANK[item.layout.priority] <= PRIORITY_RANK.medium) {
                    nextP = true;
                    nextS = 0;
                    nextT = 0;
                    reason = item.desired.reason || 'pause';
                }
            } else if (!targetPause && nextP) {
                // Resume only when GOOD/RECOVERING and cooldown passed
                if ((health === 'GOOD' || health === 'RECOVERING') && elapsed >= cooldown) {
                    nextP = false;
                    reason = 'resume';
                }
            }

            if (!nextP) {
                if (targetS < nextS) {
                    // Downgrade fast (one or more steps allowed on BAD)
                    if (emergency || elapsed >= this.cfg.emergencyCooldownMs) {
                        nextS = emergency ? targetS : nextS - 1;
                        reason = item.desired.reason || 'downgrade';
                    }
                } else if (targetS > nextS) {
                    // Upgrade one step, only after stable GOOD
                    const stableOk =
                        health === 'GOOD' &&
                        st.stableGoodSince &&
                        now() - st.stableGoodSince >= this.cfg.upgradeStableMs;
                    if (stableOk && elapsed >= this.cfg.layerCooldownMs) {
                        nextS = nextS + 1;
                        reason = 'network_recovered';
                    }
                }

                if (targetT < nextT && (emergency || elapsed >= this.cfg.emergencyCooldownMs)) {
                    nextT = Math.max(targetT, nextT - 1);
                } else if (targetT > nextT) {
                    const stableOk =
                        health === 'GOOD' &&
                        st.stableGoodSince &&
                        now() - st.stableGoodSince >= this.cfg.upgradeStableMs;
                    if (stableOk && elapsed >= this.cfg.layerCooldownMs) {
                        nextT = nextT + 1;
                    }
                }
            }

            // Clamp
            const maxS = item.max?.spatialLayer ?? 2;
            const maxT = item.max?.temporalLayer ?? 2;
            nextS = clamp(nextS, 0, maxS);
            nextT = clamp(nextT, 0, maxT);

            const changed =
                st.spatialLayer !== nextS || st.temporalLayer !== nextT || st.pause !== nextP;

            if (health === 'GOOD') {
                if (!st.stableGoodSince) st.stableGoodSince = now();
            } else {
                st.stableGoodSince = null;
            }

            if (changed) st.lastChangeAt = now();
            st.spatialLayer = nextS;
            st.temporalLayer = nextT;
            st.pause = nextP;
            this._consumerState.set(id, st);

            return {
                consumerId: id,
                consumer: item.consumer,
                priority: item.layout.priority,
                pause: nextP,
                spatialLayer: nextS,
                temporalLayer: nextT,
                changed,
                reason,
                from,
                to: { s: nextS, t: nextT, p: nextP },
            };
        }

        // ####################################################
        // Pause / layers helpers
        // ####################################################

        async _setPaused(consumerId, shouldPause, consumer) {
            const host = this.host;
            const c = consumer || host.consumers?.get?.(consumerId);
            if (!c || c.kind !== 'video') return;
            if (this._pauseCache.get(consumerId) === shouldPause) return;
            const wasPaused = !!c.paused;
            if (shouldPause === wasPaused) {
                this._pauseCache.set(consumerId, shouldPause);
                return;
            }
            try {
                if (shouldPause) {
                    await host.socket.request('pauseConsumer', { consumer_id: consumerId, type: 'video' });
                    try {
                        c.pause();
                    } catch {
                        /* ignore */
                    }
                } else {
                    await host.socket.request('resumeConsumer', { consumer_id: consumerId, type: 'video' });
                    try {
                        c.resume();
                    } catch {
                        /* ignore */
                    }
                }
                this._pauseCache.set(consumerId, shouldPause);
            } catch (err) {
                if (this._isDebug()) console.warn('[AQ] pause', consumerId, err?.error || err);
            }
        }

        _getMaxLayers(consumer) {
            try {
                const encodings = consumer?.rtpParameters?.encodings || [];
                const mode = String(encodings[0]?.scalabilityMode || '');
                const m = mode.match(/L(\d)T(\d)/i);
                if (m) {
                    // For simulcast VP8, each encoding is L1Tx — spatial = encodings.length-1
                    if (encodings.length > 1) {
                        return {
                            spatialLayer: encodings.length - 1,
                            temporalLayer: Math.max(0, parseInt(m[2], 10) - 1),
                        };
                    }
                    return {
                        spatialLayer: Math.max(0, parseInt(m[1], 10) - 1),
                        temporalLayer: Math.max(0, parseInt(m[2], 10) - 1),
                    };
                }
                if (encodings.length > 1) {
                    return { spatialLayer: encodings.length - 1, temporalLayer: 2 };
                }
                return { spatialLayer: 0, temporalLayer: 0 };
            } catch {
                return { spatialLayer: 0, temporalLayer: 0 };
            }
        }

        // ####################################################
        // Stats collection
        // ####################################################

        async _collectStatsTick() {
            const host = this.host;
            if (!host) return;

            const snapshots = [];
            let totalRecv = 0;
            let totalLoss = 0;
            let lossSamples = 0;
            let freezeDeltaSum = 0;
            let dropped = 0;
            let decoded = 0;
            let rttMs = null;
            let availIn = null;
            let availOut = null;

            // Transport stats
            try {
                const transports = [host.consumerTransport, host.producerTransport].filter(Boolean);
                for (const t of transports) {
                    if (typeof t.getStats !== 'function') continue;
                    const report = await t.getStats();
                    this._walkStats(report, (stat) => {
                        if (stat.type === 'candidate-pair' && (stat.nominated || stat.selected)) {
                            if (stat.currentRoundTripTime != null) {
                                rttMs = (stat.currentRoundTripTime || 0) * 1000;
                            }
                            if (stat.availableIncomingBitrate != null) {
                                availIn = stat.availableIncomingBitrate;
                            }
                            if (stat.availableOutgoingBitrate != null) {
                                availOut = stat.availableOutgoingBitrate;
                            }
                        }
                        if (stat.type === 'transport') {
                            if (stat.availableIncomingBitrate != null) availIn = stat.availableIncomingBitrate;
                            if (stat.availableOutgoingBitrate != null) availOut = stat.availableOutgoingBitrate;
                        }
                    });
                }
            } catch {
                /* ignore */
            }

            // Consumer inbound
            for (const [consumerId, consumer] of host.consumers || []) {
                if (consumer.kind !== 'video') continue;
                if (typeof consumer.getStats !== 'function') continue;
                try {
                    const report = await consumer.getStats();
                    const cur = this._extractInbound(report);
                    const prev = this._statsPrev.get(consumerId);
                    const dt = prev ? Math.max(0.2, (now() - prev.ts) / 1000) : 1;
                    let bitrate = null;
                    let lossPct = null;
                    let fDelta = 0;
                    let dropRatio = null;

                    if (prev && cur.bytesReceived != null) {
                        bitrate = ((cur.bytesReceived - (prev.bytesReceived || 0)) * 8) / dt;
                        totalRecv += Math.max(0, bitrate);
                    }
                    if (prev && cur.packetsReceived != null) {
                        const dPkt = Math.max(0, (cur.packetsReceived || 0) - (prev.packetsReceived || 0));
                        const dLost = Math.max(0, (cur.packetsLost || 0) - (prev.packetsLost || 0));
                        if (dPkt + dLost > 0) {
                            lossPct = dLost / (dPkt + dLost);
                            totalLoss += lossPct;
                            lossSamples += 1;
                        }
                    }
                    if (prev && cur.freezeCount != null) {
                        fDelta = Math.max(0, (cur.freezeCount || 0) - (prev.freezeCount || 0));
                        freezeDeltaSum += fDelta;
                    }
                    if (prev && cur.framesDecoded != null) {
                        const dDec = Math.max(0, (cur.framesDecoded || 0) - (prev.framesDecoded || 0));
                        const dDrop = Math.max(0, (cur.framesDropped || 0) - (prev.framesDropped || 0));
                        decoded += dDec;
                        dropped += dDrop;
                        if (dDec + dDrop > 0) dropRatio = dDrop / (dDec + dDrop);
                    }

                    // Stall: bytes increase but no frames
                    let stall = false;
                    if (prev && bitrate > 30000 && cur.framesDecoded != null) {
                        const dDec = (cur.framesDecoded || 0) - (prev.framesDecoded || 0);
                        if (dDec <= 0 && fDelta > 0) stall = true;
                        if (dDec <= 0 && bitrate > 80000) stall = true;
                    }

                    const cst = this._consumerState.get(consumerId) || {};
                    cst._stall = stall;
                    cst._lastBitrate = bitrate;
                    cst._lastLoss = lossPct;
                    cst._lastFps = cur.framesPerSecond;
                    cst._lastWh = cur.frameWidth && cur.frameHeight ? `${cur.frameWidth}x${cur.frameHeight}` : null;
                    this._consumerState.set(consumerId, cst);

                    this._statsPrev.set(consumerId, { ...cur, ts: now() });
                    snapshots.push({ consumerId, bitrate, lossPct, fDelta, dropRatio, stall, cur });
                } catch {
                    /* ignore per-consumer */
                }
            }

            // Producer outbound (webcam)
            try {
                const prodId = host.producerLabel?.get?.(this._videoProducerKey());
                const producer = prodId ? host.producers?.get?.(prodId) : null;
                if (producer && typeof producer.getStats === 'function') {
                    const report = await producer.getStats();
                    const cur = this._extractOutbound(report);
                    const prev = this._statsPrev.get('__local_cam__');
                    const dt = prev ? Math.max(0.2, (now() - prev.ts) / 1000) : 1;
                    let sendBitrate = null;
                    if (prev && cur.bytesSent != null) {
                        sendBitrate = ((cur.bytesSent - (prev.bytesSent || 0)) * 8) / dt;
                    }
                    this._statsPrev.set('__local_cam__', { ...cur, ts: now() });
                    this._metrics.sendBitrate = ewma(this._metrics.sendBitrate, sendBitrate, this.cfg.ewmaAlpha);
                    this._metrics.qualityLimitationReason = cur.qualityLimitationReason || 'none';
                    this._metrics.outboundFps = cur.framesPerSecond ?? this._metrics.outboundFps;
                    if (cur.frameWidth && cur.frameHeight) {
                        this._metrics.outboundWh = `${cur.frameWidth}x${cur.frameHeight}`;
                    }

                    if (cur.qualityLimitationReason === 'bandwidth') {
                        this._bandwidthLimitSamples += 1;
                        this._cpuLimitSamples = Math.max(0, this._cpuLimitSamples - 1);
                        this._noteUplinkHint('CONSTRAINED');
                        this.schedule(this.cfg.emergencyCooldownMs, 'sender_telemetry');
                    } else if (cur.qualityLimitationReason === 'cpu') {
                        this._cpuLimitSamples += 1;
                        this._metrics.encoderCpuPressure = true;
                        // First relieve guest downlink; only later allow uplink adapt
                        if (
                            this._guestReliefApplied &&
                            this._cpuLimitSamples >= this.cfg.protectedCpuSamplesBeforeProducer
                        ) {
                            this.schedule(this.cfg.emergencyCooldownMs, 'sender_telemetry');
                        } else {
                            this.schedule(this.cfg.emergencyCooldownMs, 'encoder_cpu');
                        }
                    } else {
                        this._bandwidthLimitSamples = Math.max(0, this._bandwidthLimitSamples - 1);
                        this._cpuLimitSamples = Math.max(0, this._cpuLimitSamples - 1);
                        if (this._cpuLimitSamples === 0) this._metrics.encoderCpuPressure = false;
                    }
                }
            } catch {
                /* ignore */
            }

            const alpha = this.cfg.ewmaAlpha;
            this._metrics.recvBitrate = ewma(this._metrics.recvBitrate, totalRecv || null, alpha);
            this._metrics.rttMs = ewma(this._metrics.rttMs, rttMs, alpha);
            this._metrics.availableIncoming = ewma(this._metrics.availableIncoming, availIn, alpha);
            this._metrics.availableOutgoing = ewma(this._metrics.availableOutgoing, availOut, alpha);
            this._metrics.freezeDelta = freezeDeltaSum;
            if (lossSamples > 0) {
                this._metrics.packetLoss = ewma(this._metrics.packetLoss, totalLoss / lossSamples, alpha);
            }
            if (decoded + dropped > 0) {
                this._metrics.framesDroppedRatio = ewma(
                    this._metrics.framesDroppedRatio,
                    dropped / (decoded + dropped),
                    alpha
                );
            }

            this._updateNetworkHealth();
            this._updateDecodePressure();

            if (this._metrics.networkHealth === 'BAD' || freezeDeltaSum > 0) {
                this.schedule(this.cfg.emergencyCooldownMs, 'sender_telemetry');
            }
        }

        _walkStats(report, fn) {
            if (!report) return;
            if (typeof report.forEach === 'function') {
                report.forEach((s) => fn(s));
                return;
            }
            for (const s of report) fn(Array.isArray(s) ? s[1] : s);
        }

        _extractInbound(report) {
            const out = {};
            this._walkStats(report, (stat) => {
                if (stat.type !== 'inbound-rtp' || stat.kind === 'audio') return;
                // Prefer the one with frames
                if (out.bytesReceived != null && (stat.framesDecoded == null && out.framesDecoded != null)) return;
                out.bytesReceived = stat.bytesReceived;
                out.packetsReceived = stat.packetsReceived;
                out.packetsLost = stat.packetsLost;
                out.jitter = stat.jitter;
                out.framesDecoded = stat.framesDecoded;
                out.framesDropped = stat.framesDropped;
                out.framesPerSecond = stat.framesPerSecond;
                out.frameWidth = stat.frameWidth;
                out.frameHeight = stat.frameHeight;
                out.freezeCount = stat.freezeCount;
                out.totalFreezesDuration = stat.totalFreezesDuration;
                out.nackCount = stat.nackCount;
                out.pliCount = stat.pliCount;
                out.firCount = stat.firCount;
            });
            return out;
        }

        _extractOutbound(report) {
            const out = {};
            this._walkStats(report, (stat) => {
                if (stat.type !== 'outbound-rtp' || stat.kind === 'audio') return;
                out.bytesSent = stat.bytesSent;
                out.packetsSent = stat.packetsSent;
                out.retransmittedPacketsSent = stat.retransmittedPacketsSent;
                out.framesPerSecond = stat.framesPerSecond;
                out.frameWidth = stat.frameWidth;
                out.frameHeight = stat.frameHeight;
                out.qualityLimitationReason = stat.qualityLimitationReason;
                out.nackCount = stat.nackCount;
                out.pliCount = stat.pliCount;
            });
            return out;
        }

        _updateNetworkHealth() {
            const m = this._metrics;
            const loss = m.packetLoss;
            const rtt = m.rttMs;
            const freeze = m.freezeDelta > 0;
            const drop = m.framesDroppedRatio;

            let sample = 'GOOD';
            const lossBad = loss != null && loss > this.cfg.lossWarn;
            const lossWarn = loss != null && loss > this.cfg.lossGood;
            const rttBad = rtt != null && rtt > this.cfg.rttWarnMs;
            const rttWarn = rtt != null && rtt > this.cfg.rttGoodMs;
            const dropBad = drop != null && drop > 0.15;
            const dropWarn = drop != null && drop > 0.05;

            if (freeze || lossBad || rttBad || dropBad) sample = 'BAD';
            else if (lossWarn || rttWarn || dropWarn) sample = 'WARNING';

            if (sample === 'BAD') {
                this._healthSamples.bad += 1;
                this._healthSamples.good = 0;
                this._healthSamples.warning = 0;
            } else if (sample === 'WARNING') {
                this._healthSamples.warning += 1;
                this._healthSamples.good = 0;
                this._healthSamples.bad = Math.max(0, this._healthSamples.bad - 1);
            } else {
                this._healthSamples.good += 1;
                this._healthSamples.bad = 0;
                this._healthSamples.warning = 0;
            }

            const prev = m.networkHealth;
            if (this._healthSamples.bad >= this.cfg.badSamplesToDowngrade) {
                m.networkHealth = 'BAD';
            } else if (sample === 'WARNING' || this._healthSamples.warning >= 2) {
                m.networkHealth = prev === 'BAD' ? 'RECOVERING' : 'WARNING';
            } else if (this._healthSamples.good >= this.cfg.goodSamplesToRecover) {
                m.networkHealth = 'GOOD';
            } else if (prev === 'BAD' || prev === 'WARNING') {
                m.networkHealth = 'RECOVERING';
            } else {
                m.networkHealth = 'GOOD';
            }
        }

        _updateDecodePressure() {
            const m = this._metrics;
            const lossOk = m.packetLoss == null || m.packetLoss < this.cfg.lossGood;
            const rttOk = m.rttMs == null || m.rttMs < this.cfg.rttGoodMs;
            const dropHigh = m.framesDroppedRatio != null && m.framesDroppedRatio > 0.1;
            const freeze = m.freezeDelta > 0;
            m.decodePressure = Boolean(lossOk && rttOk && (dropHigh || freeze));
        }

        _noteUplinkHint(state) {
            // Soft hint — actual change goes through hysteresis in _adaptProducerCeilings
            if (state === 'CONSTRAINED' && this._metrics.uplinkState === 'NORMAL') {
                this._metrics.uplinkState = 'CONSTRAINED';
            }
        }

        _videoProducerKey() {
            try {
                if (typeof mediaType !== 'undefined' && mediaType.video) return mediaType.video;
            } catch {
                /* ignore */
            }
            return 'videoType';
        }

        _screenProducerKey() {
            try {
                if (typeof mediaType !== 'undefined' && mediaType.screen) return mediaType.screen;
            } catch {
                /* ignore */
            }
            return 'screenType';
        }

        /**
         * Local webcam of meeting creator / dialog presenter / stage creator.
         * Layout/dialog/peer-count must NEVER change this producer's parameters.
         */
        isProtectedLecturerProducer() {
            const host = this.host;
            if (!host?.peer_id) return false;
            try {
                if (typeof host.isRoomCreator === 'function' && host.isRoomCreator()) return true;
            } catch {
                /* ignore */
            }
            const id = host.peer_id;
            if (host._meetingCreatorId && host._meetingCreatorId === id) return true;
            if (host._stageScene?.creatorId && host._stageScene.creatorId === id) return true;
            if (host._dialogSplitActive && host._dialogPresenterId === id) return true;
            return false;
        }

        _layoutReasons = new Set([
            'layout',
            'dialog_layout',
            'init',
            'encoder_cpu', // CPU relief is downlink-first; producer wait for samples
        ]);

        // ####################################################
        // Local producer ceilings — UPLINK only, never layout
        // ####################################################

        async _adaptProducerCeilings({ reason = 'layout' } = {}) {
            const host = this.host;
            try {
                const videoKey = this._videoProducerKey();
                if (!host.producerLabel?.has?.(videoKey)) return;
                const producer = host.producers?.get?.(host.producerLabel.get(videoKey));
                if (!producer || typeof producer.getParameters !== 'function') return;

                // Capture baseline once (actual encodings after produce) — never "normalize" away from it on layout
                const paramsNow = producer.getParameters();
                if (!this._producerBaseline && Array.isArray(paramsNow?.encodings)) {
                    this._producerBaseline = paramsNow.encodings.map((e) => ({
                        maxBitrate: e.maxBitrate,
                        maxFramerate: e.maxFramerate,
                        scaleResolutionDownBy: e.scaleResolutionDownBy,
                        active: e.active,
                        scalabilityMode: e.scalabilityMode,
                        rid: e.rid,
                    }));
                    this._lastProducerState = 'NORMAL';
                    if (this._isDebug()) {
                        console.log('[LECTURER PRODUCER BASELINE]', this._producerBaseline);
                    }
                }

                const protectedLecturer = this.isProtectedLecturerProducer();

                // Forbidden: dialog / layout / visible / peers / tile resize
                if (protectedLecturer && this._layoutReasons.has(reason)) {
                    return;
                }

                // Protected: only real persistent sender congestion
                if (protectedLecturer) {
                    const qlr = this._metrics.qualityLimitationReason || 'none';
                    const allowBandwidth =
                        reason === 'sender_telemetry' &&
                        qlr === 'bandwidth' &&
                        this._bandwidthLimitSamples >= this.cfg.protectedBandwidthSamples;
                    // CPU: only after guest relief had a chance (samples) AND still limited
                    const allowCpu =
                        reason === 'sender_telemetry' &&
                        qlr === 'cpu' &&
                        this._guestReliefApplied &&
                        this._cpuLimitSamples >= this.cfg.protectedCpuSamplesBeforeProducer;
                    const allowManual = reason === 'manual_preset';

                    if (!allowBandwidth && !allowCpu && !allowManual) {
                        return;
                    }
                }

                let state = 'NORMAL';
                const preset = this._resolvePreset();
                const qlr2 = this._metrics.qualityLimitationReason || 'none';

                if (qlr2 === 'bandwidth' && this._bandwidthLimitSamples >= this.cfg.protectedBandwidthSamples) {
                    state =
                        this._bandwidthLimitSamples >= this.cfg.protectedBandwidthSamples + 3
                            ? 'SEVERE'
                            : 'CONSTRAINED';
                } else if (
                    qlr2 === 'cpu' &&
                    this._guestReliefApplied &&
                    this._cpuLimitSamples >= this.cfg.protectedCpuSamplesBeforeProducer
                ) {
                    state = 'CONSTRAINED';
                } else if (reason === 'manual_preset') {
                    // Explicit preset: apply NORMAL/CONSTRAINED ceilings from preset only
                    if (preset === 'perf') state = 'SEVERE';
                    else if (preset === 'saver') state = 'CONSTRAINED';
                    else state = 'NORMAL';
                } else if (!protectedLecturer) {
                    if (preset === 'perf' || this._metrics.networkHealth === 'BAD') state = 'SEVERE';
                    else if (preset === 'saver' || this._metrics.networkHealth === 'WARNING') state = 'CONSTRAINED';
                }

                // Never proactive-degrade protected lecturer when limitation is none (except manual preset)
                if (protectedLecturer && qlr2 === 'none' && reason !== 'manual_preset') {
                    return;
                }

                if (
                    this._lastProducerState === state &&
                    now() - this._lastProducerChangeAt < this.cfg.producerStateCooldownMs
                ) {
                    return;
                }
                const rank = { NORMAL: 0, CONSTRAINED: 1, SEVERE: 2 };
                const worse = (rank[state] || 0) > (rank[this._lastProducerState] || 0);
                if (
                    !worse &&
                    this._lastProducerState &&
                    now() - this._lastProducerChangeAt < this.cfg.producerStateCooldownMs
                ) {
                    return;
                }

                // Protected NORMAL → restore baseline ceilings if we previously constrained
                let ceilings;
                if (protectedLecturer && state === 'NORMAL' && this._producerBaseline) {
                    ceilings = null; // restore baseline bitrates below
                } else {
                    ceilings = { ...this.cfg.producerCeilings[state] };
                if (preset === 'max' && state === 'NORMAL') {
                    ceilings = { high: 7500000, mid: 2200000, low: 600000 };
                }
                }

                const params = producer.getParameters();
                const encodings = params?.encodings;
                if (!Array.isArray(encodings) || !encodings.length) return;

                const oldSnap = encodings.map((e) => ({
                    maxBitrate: e.maxBitrate,
                    maxFramerate: e.maxFramerate,
                    active: e.active,
                }));

                let changed = false;
                if (ceilings == null && this._producerBaseline) {
                    encodings.forEach((enc, i) => {
                        const base = this._producerBaseline[Math.min(i, this._producerBaseline.length - 1)];
                        if (!base) return;
                        if (base.maxBitrate != null && enc.maxBitrate !== base.maxBitrate) {
                            enc.maxBitrate = base.maxBitrate;
                            changed = true;
                        }
                        // Never flip active / scale / framerate from adaptive for protected
                    });
                } else {
                    const targets =
                        encodings.length >= 3
                            ? [ceilings.low, ceilings.mid, ceilings.high]
                            : encodings.length === 2
                              ? [ceilings.mid, ceilings.high]
                              : [ceilings.high];
                    encodings.forEach((enc, i) => {
                        const next = targets[Math.min(i, targets.length - 1)];
                        if (enc.maxBitrate !== next) {
                            enc.maxBitrate = next;
                            changed = true;
                        }
                    });
                }

                if (!changed) {
                    this._lastProducerState = state;
                    return;
                }

                await producer.setParameters(params);
                this._lastProducerState = state;
                this._lastProducerChangeAt = now();
                this._metrics.uplinkState = state;

                if (this._isDebug()) {
                    console.warn('[LECTURER PRODUCER CHANGE]', {
                        reason,
                        qlr,
                        state,
                        protected: protectedLecturer,
                        old: oldSnap,
                        new: encodings.map((e) => ({
                            maxBitrate: e.maxBitrate,
                            maxFramerate: e.maxFramerate,
                            active: e.active,
                        })),
                    });
                }
            } catch (err) {
                if (this._isDebug()) console.warn('[AQ] producer ceiling', err?.message || err);
            }
        }

        _isDisabled() {
            try {
                const q = new URLSearchParams(location.search).get('disableVideoAdaptive');
                if (q === '1' || q === 'true') return true;
                return localStorage.getItem('disable_video_adaptive') === '1';
            } catch {
                return false;
            }
        }

        _snapshotLecturer(label) {
            if (!this._isDebug()) return;
            try {
                const host = this.host;
                const videoKey = this._videoProducerKey();
                const producer = host.producers?.get?.(host.producerLabel?.get?.(videoKey));
                const track = producer?.track;
                const settings = track?.getSettings?.() || {};
                let encodings = [];
                try {
                    encodings = producer?.getParameters?.()?.encodings || [];
                } catch {
                    /* ignore */
                }
                const guests = [];
                for (const [consumerId, consumer] of host.consumers || []) {
                    if (consumer.kind !== 'video') continue;
                    const layout = this._classifyLayout(consumerId, consumer);
                    if (!layout.isDialogGuest && layout.priority !== 'medium') continue;
                    const st = this._consumerState.get(consumerId) || {};
                    guests.push({
                        peer: layout.peerId,
                        layer: `${st.spatialLayer}:${st.temporalLayer}`,
                        pause: st.pause,
                        res: st._lastWh,
                        fps: st._lastFps,
                        br: st._lastBitrate,
                    });
                }
                console.log(`[AQ ${label}]`, {
                    dialog: !!host._dialogSplitActive,
                    protected: this.isProtectedLecturerProducer(),
                    track: {
                        id: track?.id,
                        readyState: track?.readyState,
                        width: settings.width,
                        height: settings.height,
                        frameRate: settings.frameRate,
                        deviceId: settings.deviceId,
                    },
                    producer: {
                        codec: producer?.rtpParameters?.codecs?.[0]?.mimeType,
                        encodings: encodings.map((e) => ({
                            rid: e.rid,
                            active: e.active,
                            maxBitrate: e.maxBitrate,
                            maxFramerate: e.maxFramerate,
                            scaleResolutionDownBy: e.scaleResolutionDownBy,
                            scalabilityMode: e.scalabilityMode,
                        })),
                    },
                    outbound: {
                        bitrate: this._metrics.sendBitrate,
                        fps: this._metrics.outboundFps,
                        wh: this._metrics.outboundWh,
                        qualityLimitationReason: this._metrics.qualityLimitationReason,
                    },
                    guests,
                    health: this._metrics.networkHealth,
                    encoderCpu: this._metrics.encoderCpuPressure,
                });
            } catch (err) {
                console.warn('[AQ snapshot]', err);
            }
        }

        // ####################################################
        // Preset / debug
        // ####################################################

        _resolvePreset() {
            try {
                const el = typeof streamQualityPreset !== 'undefined' ? streamQualityPreset : null;
                if (el?.value && PRESETS.includes(el.value)) {
                    this._preset = el.value;
                    return el.value;
                }
                const saved =
                    typeof localStorageSettings !== 'undefined'
                        ? localStorageSettings.stream_quality_preset
                        : null;
                if (saved && PRESETS.includes(saved)) {
                    this._preset = saved;
                    return saved;
                }
            } catch {
                /* ignore */
            }
            return this._preset || 'max';
        }

        _syncDebugFlag() {
            try {
                const q = new URLSearchParams(location.search).get('videoDebug');
                if (q === '1' || q === 'true') localStorage.setItem('video_debug', '1');
            } catch {
                /* ignore */
            }
        }

        _isDebug() {
            try {
                return localStorage.getItem('video_debug') === '1';
            } catch {
                return false;
            }
        }

        _maybeStartDebug() {
            clearInterval(this._debugTimer);
            if (!this._isDebug()) return;
            this._debugTimer = setInterval(() => this._printDebug(), this.cfg.debugIntervalMs);
        }

        _printDebug() {
            if (!this._isDebug()) return;
            const host = this.host;
            const rows = [];
            for (const [consumerId, consumer] of host.consumers || []) {
                if (consumer.kind !== 'video') continue;
                const st = this._consumerState.get(consumerId) || {};
                const layout = this._classifyLayout(consumerId, consumer);
                rows.push({
                    peer: (layout.peerId || '').slice(0, 6),
                    type: layout.mediaKind,
                    pri: layout.priority,
                    layer: `${st.spatialLayer ?? '-'}:${st.temporalLayer ?? '-'}`,
                    pause: !!st.pause,
                    res: st._lastWh || '-',
                    fps: st._lastFps ?? '-',
                    br: st._lastBitrate != null ? Math.round(st._lastBitrate / 1000) + 'k' : '-',
                    loss: st._lastLoss != null ? (st._lastLoss * 100).toFixed(1) + '%' : '-',
                    reason: st.pause ? layout.reason : '-',
                });
            }
            console.log(
                '[AQ]',
                {
                    health: this._metrics.networkHealth,
                    uplink: this._metrics.uplinkState,
                    preset: this._resolvePreset(),
                    rtt: this._metrics.rttMs != null ? Math.round(this._metrics.rttMs) + 'ms' : '-',
                    recv: this._metrics.recvBitrate != null ? Math.round(this._metrics.recvBitrate / 1000) + 'k' : '-',
                    availIn:
                        this._metrics.availableIncoming != null
                            ? Math.round(this._metrics.availableIncoming / 1000) + 'k'
                            : '-',
                    decodePressure: this._metrics.decodePressure,
                    encoderCpu: this._metrics.encoderCpuPressure,
                    qlr: this._metrics.qualityLimitationReason,
                    outFps: this._metrics.outboundFps,
                    protected: this.isProtectedLecturerProducer(),
                    changes: this._lastReasons.slice(-5),
                },
                rows
            );
        }

        getDiagnostics() {
            return {
                metrics: { ...this._metrics },
                preset: this._resolvePreset(),
                reasons: [...this._lastReasons],
                consumers: [...this._consumerState.entries()].map(([id, st]) => ({ id, ...st })),
            };
        }
    }

    AdaptiveQualityController.PRESETS = PRESETS;
    AdaptiveQualityController.DEFAULT_CONFIG = DEFAULT_CONFIG;
    global.AdaptiveQualityController = AdaptiveQualityController;
})(typeof window !== 'undefined' ? window : globalThis);
