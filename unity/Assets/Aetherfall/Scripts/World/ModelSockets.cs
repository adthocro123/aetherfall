using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// The attachment points from a model's meta JSON "sockets" (the Shardling's Eye fires orbs, the blades' Base/Tip
    /// give the sweep segment, the camp's Lantern/Fire take lights and VFX). Added to the model root on import.
    /// </summary>
    [DisallowMultipleComponent]
    public class ModelSockets : MonoBehaviour
    {
        [Serializable]
        public struct Entry
        {
            public string name;
            public Transform transform;
        }

        public List<Entry> sockets = new List<Entry>();

        /// <summary>The socket's transform, or null if the model has no socket of that name.</summary>
        public Transform Get(string socketName)
        {
            foreach (var e in sockets)
                if (e.name == socketName) return e.transform;
            return null;
        }
    }
}
