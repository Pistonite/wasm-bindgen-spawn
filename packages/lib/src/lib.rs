#[cfg(all(target_arch = "wasm32", not(target_feature = "atomics"), not(doc)))]
compile_error!(
    "-Ctarget_feature=atomics is not enabled. Please read the README and set the right rustflags"
);

mod spawn;
pub use spawn::{ThreadCreator,ThreadCreatorUnready};
mod join;
pub use join::JoinHandle;

/// Interop with JS
mod binding;

mod util;
pub use util::SpawnError;
