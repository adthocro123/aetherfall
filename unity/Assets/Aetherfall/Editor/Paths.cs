using System.Collections.Generic;

namespace Aetherfall.EditorTools
{
    /// <summary>Where Aetherfall's assets live in the project. The art folder mirrors art/export in the repository.</summary>
    public static class Paths
    {
        public const string Root = "Assets/Aetherfall";

        public const string Art = Root + "/Art";
        public const string Fbx = Art + "/fbx";
        public const string Meta = Art + "/meta";
        public const string Layout = Art + "/layout.json";

        public const string Shaders = Root + "/Shaders";
        public const string VertexColorShader = Shaders + "/VertexColor.shadergraph";
        public const string GlowShader = Shaders + "/Glow.shadergraph";

        public const string Materials = Root + "/Materials";
        public const string VertexColorMaterial = Materials + "/M_VertexColor.mat";
        public const string GlowMaterial = Materials + "/M_Glow.mat";

        public const string Settings = Root + "/Settings";
        public const string WorldVolumeProfile = Settings + "/WorldVolumeProfile.asset";

        public const string Scenes = Root + "/Scenes";
        public const string WorldScene = Scenes + "/World.unity";

        /// <summary>Blender material names in the FBX files, and the project material each one is remapped to.</summary>
        public static readonly Dictionary<string, string> MaterialRemaps = new Dictionary<string, string>
        {
            { "AF_VertexColor", VertexColorMaterial },
            { "AF_Glow", GlowMaterial },
        };

        /// <summary>Scatter models drawn as combined meshes by ScatterBatch; their meshes are imported readable.</summary>
        public static readonly HashSet<string> BatchedModels = new HashSet<string> { "Grass_A", "Flowers_A" };

        public static string ModelPath(string asset) => $"{Fbx}/{asset}.fbx";
        public static string MetaPath(string asset) => $"{Meta}/{asset}.json";
    }
}
