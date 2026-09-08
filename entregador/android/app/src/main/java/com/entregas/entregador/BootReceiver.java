package com.entregas.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // O rastreamento NAO reinicia sozinho: o entregador precisa abrir o app e ficar online.
        // Regra de negocio: app fechado = entregador nao aparece no mapa da empresa.
    }
}
