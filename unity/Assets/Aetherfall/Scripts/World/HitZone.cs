using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// A hit sphere from a model's meta JSON: a trigger SphereCollider parented to its bone. damageMult is the weak-point
    /// multiplier, and when says when it can be hit (the Warden's core only counts while its vault doors are open).
    /// </summary>
    [RequireComponent(typeof(SphereCollider))]
    public class HitZone : MonoBehaviour
    {
        public float damageMult = 1f;
        public string when = "always";

        public bool AlwaysActive => string.IsNullOrEmpty(when) || when == "always";
    }
}
