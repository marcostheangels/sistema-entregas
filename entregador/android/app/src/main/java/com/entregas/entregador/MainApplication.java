package com.entregas.entregador;

import android.app.Application;
import com.google.firebase.database.FirebaseDatabase;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Inicializa persistência uma única vez no ciclo de vida do App
        try {
            FirebaseDatabase.getInstance().setPersistenceEnabled(true);
        } catch (Exception ignored) {}
    }
}
