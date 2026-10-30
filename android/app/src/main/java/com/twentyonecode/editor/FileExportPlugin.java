package com.twentyonecode.editor;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;

/** Saves only user-selected exports through the Android Storage Access Framework. */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {
    private static final int MAX_ENCODED_CHUNK = 1024 * 1024;
    private final Object lock = new Object();
    private OutputStream output;
    private Uri outputUri;
    private boolean choosing;

    @PluginMethod
    public void begin(PluginCall call) {
        String name = call.getString("name", "21-code-export");
        String mime = call.getString("mime", "application/octet-stream");
        // The filename is only a suggested display name, never a filesystem path.
        name = name.replaceAll("[\\\\/\\p{Cntrl}]", "_");
        if (name.isEmpty() || name.length() > 255 || mime.length() > 127 || !mime.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+")) {
            call.reject("Invalid export filename or media type.");
            return;
        }
        synchronized (lock) {
            if (choosing || output != null) {
                call.reject("Another export is already in progress.");
                return;
            }
            choosing = true;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "fileChosen");
        } catch (ActivityNotFoundException error) {
            synchronized (lock) { choosing = false; }
            call.reject("No Android app is available to save files.", error);
        }
    }

    @ActivityCallback
    private void fileChosen(PluginCall call, ActivityResult result) {
        synchronized (lock) { choosing = false; }
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData().getData();
        try {
            OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w");
            if (stream == null) throw new IOException("The selected location could not be opened.");
            synchronized (lock) { output = stream; outputUri = uri; }
            JSObject response = new JSObject();
            response.put("cancelled", false);
            call.resolve(response);
        } catch (IOException | SecurityException error) {
            call.reject("Could not open the selected save location.", error);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() > MAX_ENCODED_CHUNK) {
            call.reject("Invalid export chunk.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            synchronized (lock) {
                if (output == null) throw new IOException("No file is open for export.");
                output.write(bytes);
            }
            call.resolve();
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Could not write to the selected file.", error);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        synchronized (lock) {
            if (output == null) { call.reject("No file is open for export."); return; }
            try {
                output.flush();
                output.close();
                output = null;
                outputUri = null;
                call.resolve();
            } catch (IOException error) {
                call.reject("Could not finish writing the selected file.", error);
            }
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        discardPartialFile();
        call.resolve();
    }

    private void discardPartialFile() {
        synchronized (lock) {
            if (output != null) {
                try { output.close(); } catch (IOException ignored) { /* Continue cleanup. */ }
                output = null;
            }
            if (outputUri != null) {
                try { getContext().getContentResolver().delete(outputUri, null, null); }
                catch (RuntimeException ignored) { /* Some providers cannot delete a partial file. */ }
                outputUri = null;
            }
            choosing = false;
        }
    }

    @Override
    protected void handleOnDestroy() {
        discardPartialFile();
    }
}
