using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// One sky island, from layout.json. Sits on the island's root object; everything on the island is placed
    /// relative to it. edgeRadii is what the player controller clamps to (src/world/island.js clampInside).
    /// </summary>
    [DisallowMultipleComponent]
    public class IslandInfo : MonoBehaviour
    {
        /// <summary>The web game keeps a grounded player this far inside the edge.</summary>
        public const float EdgeMargin = 0.6f;

        /// <summary>Below the island centre's height minus this, a falling player is returned to the last waystone.</summary>
        public const float FallDepth = 16f;

        [Tooltip("layout.json key: skyreach, verdant or warden.")]
        public string id;
        public string title;
        public string subtitle;

        [Tooltip("Nominal radius in metres (layout.json radius).")]
        public float radius;

        [Tooltip("Walkable radius from the island centre for each whole degree of atan2(z, x) in island space.")]
        public float[] edgeRadii = new float[0];

        /// <summary>Walkable radius towards island-space direction (x, z), interpolated between whole degrees.</summary>
        public float EdgeRadius(float x, float z)
        {
            int n = edgeRadii != null ? edgeRadii.Length : 0;
            if (n == 0) return radius;
            float deg = Mathf.Atan2(z, x) * Mathf.Rad2Deg;
            if (deg < 0f) deg += 360f;
            float f = deg * n / 360f;
            int i0 = (int)f % n;
            return Mathf.Lerp(edgeRadii[i0], edgeRadii[(i0 + 1) % n], f - Mathf.Floor(f));
        }

#if UNITY_EDITOR
        void OnDrawGizmosSelected()
        {
            int n = edgeRadii != null ? edgeRadii.Length : 0;
            if (n == 0) return;
            Gizmos.color = new Color(1f, 0.8f, 0.2f, 0.9f);
            Vector3 prev = Vector3.zero;
            for (int i = 0; i <= n; i++)
            {
                float a = (i % n) * Mathf.PI * 2f / n, r = edgeRadii[i % n] - EdgeMargin;
                Vector3 p = transform.TransformPoint(new Vector3(Mathf.Cos(a) * r, 0.3f, Mathf.Sin(a) * r));
                if (i > 0) Gizmos.DrawLine(prev, p);
                prev = p;
            }
        }
#endif
    }
}
