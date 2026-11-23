using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>Where a group of enemies spawns (layout.json spawns): enemyType is skitter, thornback or shardling.</summary>
    public class SpawnPoint : MonoBehaviour
    {
        public string enemyType;
        [Min(1)] public int count = 1;

        void OnDrawGizmos()
        {
            Gizmos.color = new Color(1f, 0.35f, 0.3f);
            Gizmos.DrawWireCube(transform.position + Vector3.up * 0.5f, Vector3.one);
            WorldPoint.DrawCircle(transform.position, 1f + 0.5f * count);
        }
    }
}
