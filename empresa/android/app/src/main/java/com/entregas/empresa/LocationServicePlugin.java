package com.entregas.empresa;

import android.content.Context;
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
            LocationService.start(getContext(), userId);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start service", e);
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            LocationService.stop(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop service", e);
        }
    }
}
