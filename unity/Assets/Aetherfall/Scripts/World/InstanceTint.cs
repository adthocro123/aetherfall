using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Multiplies the vertex colours of this object's renderers by a tint, like the web game's per-instance colours
    /// (layout.json scatter rows carry them as [r, g, b]). The values are linear multipliers, so they go to the shader's
    /// _Tint unconverted. Applied through a MaterialPropertyBlock, so the shared material is untouched.
    /// </summary>
    [ExecuteAlways, DisallowMultipleComponent]
    public class InstanceTint : MonoBehaviour
    {
        static readonly int TintId = Shader.PropertyToID("_Tint");
        static MaterialPropertyBlock block;

        public Color tint = Color.white;

        void OnEnable() => Apply();
        void OnValidate() => Apply();

        void OnDisable()
        {
            foreach (var r in GetComponentsInChildren<Renderer>(true))
                if (r) r.SetPropertyBlock(null);
        }

        public void Apply()
        {
            block ??= new MaterialPropertyBlock();
            foreach (var r in GetComponentsInChildren<Renderer>(true))
            {
                r.GetPropertyBlock(block);
                block.SetVector(TintId, new Vector4(tint.r, tint.g, tint.b, 1f));
                r.SetPropertyBlock(block);
            }
        }
    }
}
