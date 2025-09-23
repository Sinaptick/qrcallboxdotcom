package com.stable.qrcallbox.utils

import android.text.format.DateFormat
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.stable.qrcallbox.databinding.ItemScanBinding
import com.stable.qrcallbox.models.ScanNotification
import java.util.*
import java.util.concurrent.TimeUnit

class ScanAdapter(
    private val onAssistClick: (ScanNotification) -> Unit
) : ListAdapter<ScanNotification, ScanAdapter.ScanViewHolder>(ScanDiffCallback()) {
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ScanViewHolder {
        val binding = ItemScanBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ScanViewHolder(binding)
    }
    
    override fun onBindViewHolder(holder: ScanViewHolder, position: Int) {
        // Clean up any existing timers before binding new data
        holder.cleanup()
        holder.bind(getItem(position), onAssistClick)
    }
    
    override fun onBindViewHolder(holder: ScanViewHolder, position: Int, payloads: MutableList<Any>) {
        if (payloads.isEmpty()) {
            super.onBindViewHolder(holder, position, payloads)
        } else {
            // Handle partial updates for better performance
            val scan = getItem(position)
            payloads.forEach { payload ->
                when (payload) {
                    "status_changed", "claimed_changed" -> {
                        holder.updateAssistButton(scan)
                    }
                }
            }
        }
    }
    
    override fun onViewRecycled(holder: ScanViewHolder) {
        super.onViewRecycled(holder)
        holder.cleanup()
    }
    
    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        super.onDetachedFromRecyclerView(recyclerView)
        // Clean up all timers when adapter is detached
        for (i in 0 until itemCount) {
            val holder = recyclerView.findViewHolderForAdapterPosition(i) as? ScanViewHolder
            holder?.cleanup()
        }
    }
    
    class ScanViewHolder(private val binding: ItemScanBinding) : RecyclerView.ViewHolder(binding.root) {
        
        fun bind(scan: ScanNotification, onAssistClick: (ScanNotification) -> Unit) {
            binding.areaTextView.text = scan.areaDescription
            
            // Format timestamp and calculate elapsed time
            scan.timestamp?.let { timestamp ->
                val date = timestamp.toDate()
                val formattedTime = DateFormat.format("MMM dd, h:mm a", date).toString()
                binding.timestampTextView.text = formattedTime
                
                // Only show elapsed time for pending requests (no one is assisting yet)
                if (scan.claimedByName.isEmpty() && scan.status == "pending") {
                    updateElapsedTime(timestamp)
                } else {
                    // Hide elapsed time when someone is assisting or request is resolved
                    binding.elapsedTimeTextView.visibility = View.GONE
                    // Clean up any running timer
                    timerUpdateRunnable?.let { runnable ->
                        binding.elapsedTimeTextView.removeCallbacks(runnable)
                    }
                    timerUpdateRunnable = null
                }
            }
            
            // Show assist button or associate name based on request status
            when {
                scan.claimedByName.isNotEmpty() -> {
                    // Show associate name instead of assist button
                    binding.assistButton.text = "👤 ${scan.claimedByName}"
                    binding.assistButton.visibility = View.VISIBLE
                    binding.assistButton.isEnabled = false
                    binding.assistButton.alpha = 0.7f
                    binding.assistButton.gravity = android.view.Gravity.CENTER
                    binding.assistButton.setPadding(16, 12, 16, 12)
                }
                scan.status == "pending" -> {
                    // Show assist button for pending requests
                    binding.assistButton.text = "Assist"
                    binding.assistButton.visibility = View.VISIBLE
                    binding.assistButton.isEnabled = true
                    binding.assistButton.alpha = 1.0f
                    binding.assistButton.gravity = android.view.Gravity.CENTER
                    binding.assistButton.setPadding(16, 12, 16, 12)
                    binding.assistButton.setOnClickListener {
                        onAssistClick(scan)
                    }
                }
                else -> {
                    // Hide button for resolved requests
                    binding.assistButton.visibility = View.GONE
                }
            }
        }
        
        private fun updateElapsedTime(timestamp: com.google.firebase.Timestamp) {
            // Calculate elapsed time
            val elapsedMillis = System.currentTimeMillis() - timestamp.toDate().time
            val elapsedText = formatElapsedTime(elapsedMillis)
            binding.elapsedTimeTextView.text = "⏱️ $elapsedText ago"
            binding.elapsedTimeTextView.visibility = View.VISIBLE
            
            // Cancel any existing timer to prevent memory leaks
            cleanup()
            
            // Only update every 30 seconds to reduce battery/memory usage
            // For requests older than 5 minutes, stop real-time updates
            if (elapsedMillis < 5 * 60 * 1000L) {
                timerUpdateRunnable = Runnable {
                    // Check if view is still attached before updating
                    if (binding.elapsedTimeTextView.isAttachedToWindow) {
                        updateElapsedTime(timestamp)
                    }
                }
                // Update every 30 seconds instead of every second
                binding.elapsedTimeTextView.postDelayed(timerUpdateRunnable!!, 30000)
            }
        }
        
        private var timerUpdateRunnable: Runnable? = null
        
        private fun formatElapsedTime(elapsedMillis: Long): String {
            val seconds = TimeUnit.MILLISECONDS.toSeconds(elapsedMillis)
            val minutes = TimeUnit.MILLISECONDS.toMinutes(elapsedMillis)
            val hours = TimeUnit.MILLISECONDS.toHours(elapsedMillis)
            
            return when {
                hours > 0 -> "${hours}h ${minutes % 60}m"
                minutes > 0 -> "${minutes}m ${seconds % 60}s"
                else -> "${seconds}s"
            }
        }
        
        fun updateAssistButton(scan: ScanNotification) {
            // Optimized method for partial updates of just the assist button
            when {
                scan.claimedByName.isNotEmpty() -> {
                    // Show associate name instead of assist button
                    binding.assistButton.text = "👤 ${scan.claimedByName}"
                    binding.assistButton.visibility = View.VISIBLE
                    binding.assistButton.isEnabled = false
                    binding.assistButton.alpha = 0.7f
                }
                scan.status == "pending" -> {
                    // Show assist button for pending requests
                    binding.assistButton.text = "Assist"
                    binding.assistButton.visibility = View.VISIBLE
                    binding.assistButton.isEnabled = true
                    binding.assistButton.alpha = 1.0f
                }
                else -> {
                    // Hide button for resolved requests
                    binding.assistButton.visibility = View.GONE
                }
            }
        }
        
        fun cleanup() {
            // Cancel any running timer to prevent memory leaks
            timerUpdateRunnable?.let { runnable ->
                binding.elapsedTimeTextView.removeCallbacks(runnable)
            }
            timerUpdateRunnable = null
        }
    }
    
    private class ScanDiffCallback : DiffUtil.ItemCallback<ScanNotification>() {
        override fun areItemsTheSame(oldItem: ScanNotification, newItem: ScanNotification): Boolean {
            return oldItem.scanId == newItem.scanId
        }
        
        override fun areContentsTheSame(oldItem: ScanNotification, newItem: ScanNotification): Boolean {
            // Optimize comparison by checking specific fields that affect UI
            return oldItem.scanId == newItem.scanId &&
                    oldItem.status == newItem.status &&
                    oldItem.claimedByName == newItem.claimedByName &&
                    oldItem.areaDescription == newItem.areaDescription &&
                    oldItem.timestamp == newItem.timestamp
        }
        
        override fun getChangePayload(oldItem: ScanNotification, newItem: ScanNotification): Any? {
            // Return specific change payload to enable partial updates
            return when {
                oldItem.status != newItem.status -> "status_changed"
                oldItem.claimedByName != newItem.claimedByName -> "claimed_changed"
                else -> null
            }
        }
    }
}