#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::{Parser, Subcommand};
use myusagi::pack;
use myusagi::prefs;
use myusagi::{resolve_launch, run_app, VERSION};

#[derive(Parser)]
#[command(name = "myusagi", version = VERSION, about = "MyUsagi desktop pet")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    #[arg(short = 's', long, global = true)]
    size: Option<String>,
}

#[derive(Subcommand)]
enum Command {
    Start,
    Pack,
    Version,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Command::Pack) => {
            if let Err(e) = pack::run_pack() {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
        Some(Command::Version) => {
            println!("{VERSION}");
        }
        None | Some(Command::Start) => {
            if let Some(ref size) = cli.size {
                if !["small", "medium", "large"].contains(&size.as_str()) {
                    eprintln!("Invalid size \"{size}\". Use: small, medium, large");
                    std::process::exit(1);
                }
            }

            let prefs = prefs::load_from_disk();
            let launch = resolve_launch(cli.size, &prefs);
            if let Err(e) = run_app(launch) {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
    }
}
