package com.ndaziramiye.sdkapp

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.minewtech.sensor.ble.utils.BLETool
import com.ylwl.industry.bean.IndustrialHtSensor
import com.ylwl.industry.enums.HtFrameType
import com.ylwl.industry.enums.MSensorConnectionState
import com.ylwl.industry.frames.DeviceStaticInfoFrame
import com.ylwl.industry.frames.IndustrialHtFrame
import com.ylwl.industry.interfaces.OnConnStateListener
import com.ylwl.industry.interfaces.OnModifyConfigurationListener
import com.ylwl.industry.interfaces.OnScanSensorResultListener
import com.ylwl.industry.manager.IndustrySensorBleManager

class MinewBleModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "MinewBLE"
        private const val DEFAULT_PASSWORD = "minewtech1234567"
    }

    override fun getName() = "MinewBleModule"

    private val manager: IndustrySensorBleManager by lazy {
        IndustrySensorBleManager.getInstance()
    }

    private val scannedSensors = mutableMapOf<String, IndustrialHtSensor>()
    private var scanning = false

    private fun emit(event: String, data: Any) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, data)
    }

    // ── Connection state listener ─────────────────────────────────────────────
    private val connStateListener = OnConnStateListener { mac, state ->
        emit("onConnectionChange", Arguments.createMap().apply {
            putString("mac", mac)
            putString("state", mapState(state))
        })
    }

    init {
        manager.setSecretKey(DEFAULT_PASSWORD)
        manager.setOnConnStateListener(connStateListener)
    }

    private fun mapState(state: MSensorConnectionState): String = when (state) {
        MSensorConnectionState.Connecting         -> "connecting"
        MSensorConnectionState.Connected          -> "connected"
        MSensorConnectionState.AuthenticateSuccess -> "connected_complete"
        MSensorConnectionState.AuthenticateFail   -> "password_error"
        MSensorConnectionState.ConnectComplete    -> "connected_complete"
        MSensorConnectionState.Disconnect         -> "disconnected"
        else                                      -> "unknown"
    }

    // ── Scan ──────────────────────────────────────────────────────────────────
    @ReactMethod
    fun startScan() {
        if (scanning) return
        if (!BLETool.isBluetoothTurnOn(reactContext)) {
            emit("onScanError", Arguments.createMap().apply { putString("error", "bluetooth_off") })
            return
        }
        scanning = true
        manager.startScan(reactContext, 90_000, object : OnScanSensorResultListener {
            override fun onScanResult(list: MutableList<IndustrialHtSensor>) {
                processScanResults(list)
            }
            override fun onStopScan(list: MutableList<IndustrialHtSensor>) {
                scanning = false
            }
        })
    }

    private fun processScanResults(list: List<IndustrialHtSensor>) {
        val emitList = Arguments.createArray()
        synchronized(scannedSensors) {
            for (sensor in list) {
                val mac = sensor.macAddress ?: continue
                val htFrame = sensor.getMinewFrame(HtFrameType.INDUSTRIAL_HT_FRAME) as? IndustrialHtFrame
                val staticFrame = sensor.getMinewFrame(HtFrameType.DEVICE_STATIC_INFO_FRAME) as? DeviceStaticInfoFrame

                // Resolve temperature — try direct frame first, then reflection fallback
                val temp: Double?
                val hum: Double?
                if (htFrame != null) {
                    val t = htFrame.temperature.toDouble()
                    val h = htFrame.humidity.toDouble()
                    temp = if (t.isFinite()) t else null
                    hum  = if (h.isFinite()) h else null
                } else {
                    temp = readDoubleReflect(sensor, listOf("getTemperature", "getTemp"))
                    hum  = readDoubleReflect(sensor, listOf("getHumidity", "getHumi"))
                }

                // Only emit if we have real data
                if (temp == null) continue

                scannedSensors[mac] = sensor

                emitList.pushMap(Arguments.createMap().apply {
                    putString("mac", mac)
                    putString("name", sensor.name ?: "S3")
                    putInt("rssi", sensor.rssi)
                    putDouble("temperature", temp)
                    putDouble("humidity", hum ?: 0.0)
                    staticFrame?.battery?.let { putInt("battery", it) }
                })
            }
        }
        if (emitList.size() > 0) emit("onDevicesUpdated", emitList)
    }

    private fun readDoubleReflect(obj: Any, methods: List<String>): Double? {
        for (name in methods) {
            try {
                val result = obj.javaClass.getMethod(name).invoke(obj)
                if (result is Number) return result.toDouble()
            } catch (ignored: Exception) {}
        }
        return null
    }

    @ReactMethod
    fun stopScan() {
        scanning = false
        manager.stopScan(reactContext)
    }

    // ── Connect / Disconnect ──────────────────────────────────────────────────
    @ReactMethod
    fun connectToDevice(mac: String, key: String?) {
        Thread {
            try {
                manager.stopScan(reactContext)
                scanning = false
                val sensor = synchronized(scannedSensors) { scannedSensors[mac] }
                if (sensor != null) {
                    manager.connect(reactContext, sensor)
                } else {
                    manager.connect(reactContext, mac)
                }
            } catch (e: Exception) {
                Log.e(TAG, "connectToDevice error", e)
                emit("onConnectionChange", Arguments.createMap().apply {
                    putString("mac", mac); putString("state", "disconnected")
                })
            }
        }.start()
    }

    @ReactMethod
    fun disconnectDevice(mac: String) {
        Thread {
            try { manager.disConnect(mac) } catch (e: Exception) { Log.e(TAG, "disconnect error", e) }
        }.start()
    }

    // ── Read TH history ───────────────────────────────────────────────────────
    @ReactMethod
    fun readHistoryData(mac: String) {
        Thread {
            val systemTime = System.currentTimeMillis() / 1000
            val handler = java.lang.reflect.InvocationHandler { _, method, args ->
                if (method.name == "receiverData" && args != null && args.size >= 2) {
                    val macAddr = args[0] as? String ?: mac
                    val items = args[1] as? List<*> ?: emptyList<Any>()
                    val array = Arguments.createArray()
                    for (item in items) {
                        if (item == null) continue
                        try {
                            val t = (item.javaClass.getMethod("getTemperature").invoke(item) as? Number)?.toDouble() ?: continue
                            val h = (item.javaClass.getMethod("getHumidity").invoke(item) as? Number)?.toDouble() ?: 0.0
                            val timeRaw = item.javaClass.getMethod("getTime").invoke(item)
                            val tsMs: Long = when (timeRaw) {
                                is Number -> timeRaw.toLong().let { if (it < 1_000_000_000_000L) it * 1000L else it }
                                is String -> try {
                                    java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                                        .parse(timeRaw)?.time ?: System.currentTimeMillis()
                                } catch (ignored: Exception) { System.currentTimeMillis() }
                                else -> System.currentTimeMillis()
                            }
                            array.pushMap(Arguments.createMap().apply {
                                putDouble("temperature", t)
                                putDouble("humidity", h)
                                putDouble("timestamp", tsMs.toDouble())
                            })
                        } catch (e: Exception) { Log.e(TAG, "history item parse error", e) }
                    }
                    emit("onHistoryDataReceived", Arguments.createMap().apply {
                        putString("mac", macAddr)
                        putArray("history", array)
                    })
                }
                null
            }
            try {
                val listenerClass = try {
                    Class.forName("com.minewtech.sensor.ble.interfaces.outside.OnReceiveDataListener")
                } catch (ignored: Exception) {
                    Class.forName("com.ylwl.industry.interfaces.OnReceiveDataListener")
                }
                val proxy = java.lang.reflect.Proxy.newProxyInstance(
                    listenerClass.classLoader, arrayOf(listenerClass), handler
                )
                try {
                    manager.javaClass
                        .getMethod("readThHistoryData", String::class.java, listenerClass)
                        .invoke(manager, mac, proxy)
                } catch (ignored: NoSuchMethodException) {
                    manager.javaClass
                        .getMethod("readHtHistoryData", String::class.java,
                            Long::class.java, Long::class.java, Long::class.java, listenerClass)
                        .invoke(manager, mac, systemTime - 604800L, systemTime, systemTime, proxy)
                }
            } catch (e: Exception) {
                Log.e(TAG, "readHistoryData failed: ${e.message}")
                emit("onHistoryDataReceived", Arguments.createMap().apply {
                    putString("mac", mac)
                    putArray("history", Arguments.createArray())
                })
            }
        }.start()
    }

    // ── Set temperature unit ──────────────────────────────────────────────────
    @ReactMethod
    fun setTemperatureUnit(mac: String, isCelsius: Boolean, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) { promise.resolve(success) }
        }
        try {
            manager.setTemperatureUnit(mac, isCelsius, listener)
        } catch (e: Exception) { promise.reject("ERROR", e.message) }
    }

    // ── Set history storage switch (reflection — may not exist in this SDK) ───
    @ReactMethod
    fun setOpenHistoryDataStore(mac: String, isOpen: Boolean, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) { promise.resolve(success) }
        }
        try {
            manager.javaClass
                .getMethod("setOpenHistoryDataStore", String::class.java, Boolean::class.java, OnModifyConfigurationListener::class.java)
                .invoke(manager, mac, isOpen, listener)
        } catch (ignored: NoSuchMethodException) {
            // Not supported in this SDK version — resolve true silently
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("ERROR", e.message) }
    }

    // ── Set TH alarm value (reflection) ───────────────────────────────────────
    @ReactMethod
    fun setThAlarmValue(mac: String, minTemp: Int, maxTemp: Int, minHumi: Int, maxHumi: Int, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) { promise.resolve(success) }
        }
        try {
            manager.javaClass
                .getMethod("setThAlarmValue", String::class.java,
                    Int::class.java, Int::class.java, Int::class.java, Int::class.java,
                    OnModifyConfigurationListener::class.java)
                .invoke(manager, mac, minTemp, maxTemp, minHumi, maxHumi, listener)
        } catch (ignored: NoSuchMethodException) {
            promise.resolve(false)
        } catch (e: Exception) { promise.reject("ERROR", e.message) }
    }

    // ── Set TH alarm off (reflection) ─────────────────────────────────────────
    @ReactMethod
    fun setThAlarmOff(mac: String, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) { promise.resolve(success) }
        }
        try {
            manager.javaClass
                .getMethod("setThAlarmOff", String::class.java, OnModifyConfigurationListener::class.java)
                .invoke(manager, mac, listener)
        } catch (ignored: NoSuchMethodException) {
            promise.resolve(false)
        } catch (e: Exception) { promise.reject("ERROR", e.message) }
    }

    // ── Reset device ──────────────────────────────────────────────────────────
    @ReactMethod
    fun resetDevice(mac: String, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) { promise.resolve(success) }
        }
        try {
            manager.javaClass
                .getMethod("reset", String::class.java, OnModifyConfigurationListener::class.java)
                .invoke(manager, mac, listener)
        } catch (e: Exception) { promise.reject("ERROR", e.message) }
    }

    @ReactMethod fun addListener(event: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
