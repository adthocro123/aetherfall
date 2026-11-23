using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>A named point from layout.json (landing, waystoneSpawn, pell, arenaCentre, bossSpawn, skyKey).</summary>
    public class WorldPoint : MonoBehaviour
    {
        [Tooltip("layout.json points key, e.g. landing or waystoneSpawn.")]
        public string id;
        [Tooltip("arenaCentre: the arena's radius.")]
        public float radius;
        [Tooltip("arenaCentre: how close the player must come to wake the Warden.")]
        public float wakeRadius;
        [Tooltip("pell: how close the player must be to talk.")]
        public float interactRadius;
        [TextArea] public string note;

        void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.4f, 0.9f, 1f);
            Gizmos.DrawWireSphere(transform.position, 0.35f);
            Gizmos.DrawLine(transform.position, transform.position + transform.forward * 1.2f);
            float r = Mathf.Max(radius, Mathf.Max(wakeRadius, interactRadius));
            if (r > 0f) DrawCircle(transform.position, r);
        }

        internal static void DrawCircle(Vector3 c, float r)
        {
            const int n = 48;
            Vector3 prev = c + new Vector3(r, 0f, 0f);
            for (int i = 1; i <= n; i++)
            {
                float a = i * Mathf.PI * 2f / n;
                Vector3 p = c + new Vector3(Mathf.Cos(a) * r, 0f, Mathf.Sin(a) * r);
                Gizmos.DrawLine(prev, p);
                prev = p;
            }
        }
    }
}
