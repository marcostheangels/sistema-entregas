package com.entregas.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || 
            "android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction()) ||
            "CHECK_SERVICE".equals(intent.getAction())) {
            
            SharedPreferences prefs = context.getSharedPreferences("EntregadorPrefs", Context.MODE_PRIVATE);
            String userId = prefs.getString("userId", "");
            
            if (!userId.isEmpty()) {
                LocationService.start(context, userId);
            }
        }
    }
}
