package com.entregas.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.util.HashMap;
import java.util.Map;

public class LocationService extends Service {
    private static final String TAG = "LocationService";
    private static final String CHANNEL_ID = "delivery_uber_style_v20";
    private static final int NOTIFICATION_ID = 202020;
    private static final String ACTION_STOP = "STOP";
    
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private DatabaseReference databaseReference;
    private PowerManager.WakeLock wakeLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;
    private HandlerThread serviceThread;
    private Handler heartbeatHandler;
    private String userId = "";

    public static void start(Context context, String userId) {
        if (userId == null || userId.isEmpty()) return;
        
        Intent intent = new Intent(context, LocationService.class);
        intent.putExtra("userId", userId);
        
        SharedPreferences prefs = context.getSharedPreferences("EntregadorPrefs", MODE_PRIVATE);
        prefs.edit().putString("userId", userId).apply();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, LocationService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        
        serviceThread = new HandlerThread("UberStyleEngine");
        serviceThread.start();
        heartbeatHandler = new Handler(serviceThread.getLooper());

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DeliveryApp::HighPriorityLock");
        
        // Bloqueio de WiFi para manter a conexão ativa em standby
        android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF, "DeliveryApp::WifiLock");
        }

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        
        try {
            databaseReference = FirebaseDatabase.getInstance().getReference();
            FirebaseDatabase.getInstance().goOnline();
            // Mantém uma conexão ativa ouvindo um nó vazio
            databaseReference.child(".info/connected").addValueEventListener(new com.google.firebase.database.ValueEventListener() {
                @Override public void onDataChange(com.google.firebase.database.DataSnapshot snap) {
                    boolean connected = snap.getValue(Boolean.class) != null && snap.getValue(Boolean.class);
                    Log.d(TAG, "Firebase conectado: " + connected);
                }
                @Override public void onCancelled(com.google.firebase.database.DatabaseError err) {}
            });
        } catch (Exception ignored) {}

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult res) {
                if (res != null && res.getLastLocation() != null) {
                    sync(res.getLastLocation().getLatitude(), res.getLastLocation().getLongitude());
                }
            }
        };

        SharedPreferences prefs = getSharedPreferences("EntregadorPrefs", MODE_PRIVATE);
        userId = prefs.getString("userId", "");
        
        startHeartbeat();
    }

    private void startHeartbeat() {
        heartbeatHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "Heartbeat - Mantendo serviço vivo...");
                if (userId != null && !userId.isEmpty()) {
                    databaseReference.child("entregadores").child(userId).child("lastHeartbeat").setValue(System.currentTimeMillis());
                }
                heartbeatHandler.postDelayed(this, 30000); // A cada 30 segundos
            }
        }, 30000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null && intent.hasExtra("userId")) {
            userId = intent.getStringExtra("userId");
            SharedPreferences prefs = getSharedPreferences("EntregadorPrefs", MODE_PRIVATE);
            prefs.edit().putString("userId", userId).apply();
        }

        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(24 * 60 * 60 * 1000L);
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, getUberNotification());

        requestGPS();

        return START_STICKY;
    }

    private void requestGPS() {
        // Alta frequência e prioridade máxima para segundo plano
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000)
                .setMinUpdateIntervalMillis(2000)
                .setMaxUpdateDelayMillis(5000) // Força entrega rápida
                .setWaitForAccurateLocation(false)
                .build();

        try {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            fusedLocationClient.requestLocationUpdates(req, locationCallback, serviceThread.getLooper());
        } catch (SecurityException ignored) {}
    }

    private void sync(double lat, double lng) {
        if (userId == null || userId.isEmpty()) return;
        
        Map<String, Object> data = new HashMap<>();
        data.put("lat", lat);
        data.put("lng", lng);
        data.put("timestamp", System.currentTimeMillis());
        data.put("online", true);
        data.put("source", "background_service"); // Para debug saber que veio do nativo
        
        try {
            databaseReference.child("posicoes").child(userId).updateChildren(data)
                .addOnFailureListener(e -> Log.e(TAG, "Falha no Sync Background: " + e.getMessage()));
        } catch (Exception e) {
            Log.e(TAG, "Erro Fatal Sync: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Serviço de Entrega Ativo", NotificationManager.IMPORTANCE_HIGH);
            ch.setSound(null, null);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification getUberNotification() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🛵 RASTREAMENTO ATIVO")
                .setContentText("Você está visível para a empresa")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(pi)
                .build();
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        fusedLocationClient.removeLocationUpdates(locationCallback);
        serviceThread.quit();
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
