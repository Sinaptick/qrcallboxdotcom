package com.stable.qrcallbox.utils

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.stable.qrcallbox.R
import com.stable.qrcallbox.models.ActiveAssociate

class ActiveAssociatesAdapter(
    private var associates: List<ActiveAssociate> = emptyList()
) : RecyclerView.Adapter<ActiveAssociatesAdapter.AssociateViewHolder>() {

    fun updateAssociates(newAssociates: List<ActiveAssociate>) {
        associates = newAssociates
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AssociateViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_user, parent, false)
        return AssociateViewHolder(view)
    }

    override fun onBindViewHolder(holder: AssociateViewHolder, position: Int) {
        holder.bind(associates[position])
    }

    override fun getItemCount(): Int = associates.size

    class AssociateViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvUserName: TextView = itemView.findViewById(R.id.tvUserName)
        private val tvOnlineStatus: TextView = itemView.findViewById(R.id.tvOnlineStatus)
        private val tvStoreNumber: TextView = itemView.findViewById(R.id.tvStoreNumber)
        private val tvLastActive: TextView = itemView.findViewById(R.id.tvLastActive)
        private val tvShiftTime: TextView = itemView.findViewById(R.id.tvShiftTime)

        fun bind(associate: ActiveAssociate) {
            tvUserName.text = associate.getDisplayName()
            
            // Set status based on shift and activity
            tvOnlineStatus.text = when {
                associate.isOnShift && associate.hasRecentActivity -> "🟢 On Shift & Active"
                associate.isOnShift -> "🟡 On Shift"
                associate.hasRecentActivity -> "🔵 Recently Active"
                else -> "⚪ Inactive"
            }
            
            tvStoreNumber.text = associate.storeNumber.ifBlank { "Unknown" }
            tvLastActive.text = associate.getLastActiveText()
            tvShiftTime.text = associate.getShiftTimeText()
        }
    }
}