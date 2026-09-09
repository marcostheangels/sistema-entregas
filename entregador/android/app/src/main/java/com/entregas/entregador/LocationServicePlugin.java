package com.entregas.entregador;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationService")
public class LocationServicePlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        try {
            String userId = call.getString("userId", "");
            String email = call.getString("email", "");
            String senha = call.getString("senha", "");
            Context context = getContext();

            LocationService.start(context, userId, email, senha);

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start service", e);
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            Context context = getContext();
            LocationService.stop(context);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop service", e);
        }
    }
}
