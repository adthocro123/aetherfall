using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>An aether current that carries the player to another island (layout.json props that have "to").</summary>
    public class TravelCurrent : MonoBehaviour
    {
        [Tooltip("Destination island id: skyreach, verdant or warden.")]
        public string to;
        public string label;
        [Tooltip("Shown instead of label while the current is locked.")]
        public string lockedLabel;
        [Tooltip("When it unlocks, in the web game's words (quest state).")]
        public string unlock;

        public bool StartsLocked => !string.IsNullOrEmpty(unlock);
    }
}
