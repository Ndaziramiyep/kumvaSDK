package com.ndaziramiye.sdkapp

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.ylwl.industry.enums.HtFrameType
import com.ylwl.industry.enums.MSensorConnectionState
import com.ylwl.industry.frames.DeviceStaticInfoFrame
import com.ylwl.industry.frames.IndustrialHtFrame
import com.ylwl.industry.bean.IndustrialHtSensor
import com.minewtech.sensor.ble.bean.SensorModule
import com.ylwl.industry.interfaces.OnModifyConfigurationListener
import com.ylwl.industry.interfaces.OnConnStateListener
import com.ylwl.industry.interfaces.OnScanSensorResultListener
import com.ylwl.industry.manager.IndustrySensorBleManager

class MinewBleModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "MinewBLE"
        private const val DEFAULT_SECRET_KEY = "minewtech1234567"
    }

    override fun getName() = "MinewBleModule"

    private val mBleManager: IndustrySensorBleManager by lazy { IndustrySensorBleManager.getInstance() }
    private var scanning = false

    private data class DeviceData(
        val mac: String,
        val name: String,
        var type: Int? = null,
        var sensorInstance: IndustrialHtSensor? = null,
        var temperature: Double? = null,
        var humidity: Double? = null,
        var battery: Int? = null,
        var rssi: Int = -100,
        var lastSeen: Long = System.currentTimeMillis()
    )

    private val discoveredDevices = mutableMapOf<String, DeviceData>()
    private var pendingSecretKey: String = DEFAULT_SECRET_KEY
    private var pendingMac: String = ""

    private val frameMapField by lazy {
        SensorModule::class.java.getDeclaredField("mMinewFrameMap").apply { isAccessible = true }
    }

    private val sendPasswordMethod by lazy {
        try { mBleManager.javaClass.getMethod("sendPassword", String::class.java, String::class.java) }
        catch (ignored: Exception) { null }
    }

    private fun getSensorType(sensor: IndustrialHtSensor): Int? {
        return try {
            val method = sensor.javaClass.getMethod("getType")
            val result = method.invoke(sensor)
            when (result) {
                is Number -> result.toInt()
                is String -> result.toIntOrNull()
                else -> null
            }
        } catch (ignored: Exception) {
            null
        }
    }

private val mConnStateListener = OnConnStateListener { mac, state ->
        if (state.name == "VerifyPassword") {
            sendPasswordMethod?.let {
                try { it.invoke(mBleManager, mac, pendingSecretKey) }
                catch (e: Exception) { Log.e(TAG, "sendPassword error", e) }
            }
        }
        val map = Arguments.createMap().apply {
            putString("mac", mac)
            putString("state", mapConnectionState(state))
            synchronized(discoveredDevices) {
                discoveredDevices[mac]?.battery?.let { putInt("battery", it) }
            }
        }
        emit("onConnectionChange", map)
    }

    init {
        mBleManager.setSecretKey(DEFAULT_SECRET_KEY)
        mBleManager.setOnConnStateListener(mConnStateListener)
    }

    private fun mapConnectionState(state: MSensorConnectionState): String = when (state.name) {
        "Connecting" -> "connecting"
        "Connected" -> "connected"
        "VerifyPassword" -> "verify_password"
        "PasswordError" -> "password_error"
        "ConnectComplete" -> "connected_complete"
        "Disconnect" -> "disconnected"
        else -> "unknown"
    }

    private fun emit(event: String, data: Any) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, data)
    }

    @ReactMethod
    fun startScan() {
        if (scanning) return
        scanning = true
        mBleManager.startScan(reactContext, 5 * 60 * 1000, object : OnScanSensorResultListener {
            override fun onScanResult(list: MutableList<IndustrialHtSensor>) { processScanResults(list) }
            override fun onStopScan(list: MutableList<IndustrialHtSensor>) { scanning = false }
        })
    }

    private fun processScanResults(list: List<IndustrialHtSensor>) {
        synchronized(discoveredDevices) {
            for (sensor in list) {
                val mac = sensor.macAddress ?: continue
                val industrialHtFrame = sensor.getMinewFrame(HtFrameType.INDUSTRIAL_HT_FRAME) as? IndustrialHtFrame
                val staticInfoFrame = sensor.getMinewFrame(HtFrameType.DEVICE_STATIC_INFO_FRAME) as? DeviceStaticInfoFrame
                val sensorType = getSensorType(sensor)

                // Try to resolve temp/hum first — accept the device if we get data
                val (temp, hum) = resolveTemperatureHumidity(sensor, industrialHtFrame)

                // Accept if: known TH type, MST01 name, has a frame, or we actually got temp data
                val isTH = sensorType == 3
                    || sensor.name?.contains("MST01", ignoreCase = true) == true
                    || industrialHtFrame != null
                    || temp != null
                if (!isTH) continue

                val data = discoveredDevices.getOrPut(mac) { DeviceData(mac, sensor.name ?: "Unknown", sensorType) }
                data.type = sensorType
                data.sensorInstance = sensor
                data.rssi = sensor.rssi
                data.lastSeen = System.currentTimeMillis()
                staticInfoFrame?.battery?.let { data.battery = it }
                temp?.let { data.temperature = it }
                hum?.let { data.humidity = it }
            }
        }
        emitDevices()
    }

    private fun resolveTemperatureHumidity(sensor: IndustrialHtSensor, frame: IndustrialHtFrame?): Pair<Double?, Double?> {
        frame?.let {
            val temp = it.temperature.toDouble()
            val hum = it.humidity.toDouble()
            if (temp.isFinite() && hum.isFinite()) return Pair(temp, hum)
        }
        return extractFromFrames(sensor)
    }

    private fun extractFromFrames(sensor: IndustrialHtSensor): Pair<Double?, Double?> {
        val frameMap = try { @Suppress("UNCHECKED_CAST") frameMapField.get(sensor) as? Map<*, *> } catch (e: Exception) { null }
        frameMap?.forEach { (_, frame) ->
            val temp = readDoubleFromFrame(frame, listOf("getTemperature", "getTemp"))
            val hum = readDoubleFromFrame(frame, listOf("getHumidity", "getHumi"))
            if (temp != null || hum != null) return Pair(temp, hum)
        }
        return Pair(null, null)
    }

    private fun readDoubleFromFrame(frame: Any?, names: List<String>): Double? {
        if (frame == null) return null
        for (name in names) {
            try {
                val result = frame.javaClass.getMethod(name).invoke(frame)
                when (result) {
                    is Number -> return result.toDouble()
                    is String -> result.toDoubleOrNull()?.let { return it }
                }
            } catch (ignored: Exception) {}
        }
        return null
    }

    private fun emitDevices() {
        val list = Arguments.createArray()
        synchronized(discoveredDevices) {
            for (d in discoveredDevices.values) {
                // Only emit devices that have at least temperature data
                if (d.temperature == null) continue
                list.pushMap(Arguments.createMap().apply {
                    putString("mac", d.mac)
                    putString("name", d.name)
                    d.type?.let { putInt("type", it) }
                    putDouble("temperature", d.temperature!!)
                    d.humidity?.let { putDouble("humidity", it) }
                    d.battery?.let { putInt("battery", it) }
                    putInt("rssi", d.rssi)
                })
            }
        }
        if (list.size() > 0) emit("onDevicesUpdated", list)
    }

    @ReactMethod
    fun stopScan() {
        scanning = false
        mBleManager.stopScan(reactContext)
    }

    @ReactMethod
    fun connectToDevice(mac: String, key: String?) {
        UiThreadUtil.runOnUiThread {
            try {
                val sensor = synchronized(discoveredDevices) { discoveredDevices[mac]?.sensorInstance }
                pendingMac = mac
                pendingSecretKey = key ?: DEFAULT_SECRET_KEY
                mBleManager.setSecretKey(pendingSecretKey)
                if (sensor != null) mBleManager.connect(reactContext, sensor)
                else mBleManager.connect(reactContext, mac)
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed for $mac", e)
                emit("onConnectionChange", Arguments.createMap().apply {
                    putString("mac", mac); putString("state", "disconnected")
                })
            }
        }
    }

    @ReactMethod
    fun disconnectDevice(mac: String) { mBleManager.disConnect(mac) }

    @ReactMethod
    fun readHistoryData(mac: String) {
        UiThreadUtil.runOnUiThread {
            val systemTime = System.currentTimeMillis() / 1000
            val invocationHandler = java.lang.reflect.InvocationHandler { _, method, args ->
                if (method.name == "receiverData" && args != null && args.size >= 2) {
                    val macAddress = args[0] as? String
                    val list = args[1] as? List<*>
                    val array = Arguments.createArray()
                    list?.forEach { data ->
                        if (data == null) return@forEach
                        try {
                            val tVal = (data.javaClass.getMethod("getTemperature").invoke(data) as? Number)?.toDouble() ?: 0.0
                            val hVal = (data.javaClass.getMethod("getHumidity").invoke(data) as? Number)?.toDouble() ?: 0.0
                            val timeRaw = data.javaClass.getMethod("getTime").invoke(data)
                            // getTime() may return seconds-since-epoch (Long) or a formatted string
                            val tsMs: Long = when (timeRaw) {
                                is Number -> {
                                    val v = timeRaw.toLong()
                                    if (v < 1_000_000_000_000L) v * 1000L else v
                                }
                                is String -> {
                                    try {
                                        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                                        sdf.parse(timeRaw)?.time ?: System.currentTimeMillis()
                                    } catch (e: Exception) { System.currentTimeMillis() }
                                }
                                else -> System.currentTimeMillis()
                            }
                            array.pushMap(Arguments.createMap().apply {
                                putDouble("temperature", tVal)
                                putDouble("humidity", hVal)
                                putDouble("timestamp", tsMs.toDouble())
                            })
                        } catch (e: Exception) { Log.e(TAG, "History parse error", e) }
                    }
                    emit("onHistoryDataReceived", Arguments.createMap().apply {
                        putString("mac", macAddress ?: mac); putArray("history", array)
                    })
                }
                null
            }
            try {
                val listenerClass = Class.forName("com.minewtech.sensor.ble.interfaces.outside.OnReceiveDataListener")
                val proxy = java.lang.reflect.Proxy.newProxyInstance(listenerClass.classLoader, arrayOf(listenerClass), invocationHandler)
                try {
                    mBleManager.javaClass.getMethod("readThHistoryData", String::class.java, listenerClass).invoke(mBleManager, mac, proxy)
                } catch (e: NoSuchMethodException) {
                    mBleManager.javaClass.getMethod("readHtHistoryData", String::class.java, Long::class.java, Long::class.java, Long::class.java, listenerClass)
                        .invoke(mBleManager, mac, systemTime - 604800, systemTime, systemTime, proxy)
                }
            } catch (e: Exception) {
                Log.e(TAG, "readHistoryData failed", e)
                // Emit empty history so JS promise resolves instead of timing out
                emit("onHistoryDataReceived", Arguments.createMap().apply {
                    putString("mac", mac); putArray("history", Arguments.createArray())
                })
            }
        }
    }

    @ReactMethod
    fun setOpenHistoryDataStore(mac: String, isOpen: Boolean, promise: Promise) {
        val listener = object : OnModifyConfigurationListener {
            override fun onModifyResult(success: Boolean) {
                emit("onConfigResult", Arguments.createMap().apply {
                    putString("mac", mac); putBoolean("success", success); putString("type", "storage")
                })
                promise.resolve(success)
            }
        }
        try {
            try {
                mBleManager.javaClass.getMethod("setOpenHistoryDataStore", String::class.java, Boolean::class.java, OnModifyConfigurationListener::class.java)
                    .invoke(mBleManager, mac, isOpen, listener); return
            } catch (e: NoSuchMethodException) {}
            try {
                mBleManager.javaClass.getMethod("setDataStoreOptionSwitch", String::class.java, Int::class.java, OnModifyConfigurationListener::class.java)
                    .invoke(mBleManager, mac, if (isOpen) 1 else 0, listener); return
            } catch (e: NoSuchMethodException) {}
            promise.reject("SDK_ERROR", "Storage config not supported")
        } catch (e: Exception) { promise.reject("REFLECT_ERROR", e.message) }
    }

    @ReactMethod fun addListener(event: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
